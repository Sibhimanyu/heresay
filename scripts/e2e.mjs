// The first milestone, end to end, against the emulators and a real browser:
// a reporter taps Report, picks Confusing, sends a sentence; the developer sees it with the
// screen and version attached and declines it with a reason; the reporter sees the reason.
//
// Run with `npm run e2e` (it starts and stops the emulators). Screenshots land in .context/.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5055';
const AUTH = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1';
const SHOTS = new URL('../.context/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const step = (s) => console.log(`\n== ${s}`);
const PROJECT = 'demo-feedback-sdk';
const OWNER = `owner${Date.now()}@example.com`;

// What create-heresay does at the end of setup: write the first owner.
async function seedOwner(email) {
  const at = new Date().toISOString();
  const r = await fetch(`http://127.0.0.1:8181/v1/projects/${PROJECT}/databases/(default)/documents/meta/instance`, {
    method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: {
      created_at: { stringValue: at },
      members: { arrayValue: { values: [{ mapValue: { fields: {
        email: { stringValue: email }, role: { stringValue: 'owner' },
        added_at: { stringValue: at }, added_by: { nullValue: null },
      } } }] } },
    } }),
  });
  assert.equal(r.status, 200, await r.text());
}

// Sign in the way a person does: ask for a link, then open it. The emulator hands us the code.
async function signInByLink(page, email) {
  await page.goto(`${BASE}/app/`);
  await page.locator('#gate').waitFor();
  await page.fill('#link-email', email);
  await page.click('#link-form button');
  await page.getByText(`Check your inbox at ${email}`).waitFor();
  const codes = (await (await fetch(`http://127.0.0.1:9199/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes;
  const code = codes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN').pop();
  assert.ok(code, 'the emulator sent a sign-in link');
  await page.goto(`${BASE}/app/?mode=signIn&oobCode=${code.oobCode}&apiKey=fake&lang=en`);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await seedOwner(OWNER);

  step('owner signs in with an email link and lands on an empty Heresay');
  const dash = await ctx.newPage();
  dash.on('pageerror', (e) => console.error('dashboard error:', e));
  await signInByLink(dash, OWNER);
  await dash.getByRole('heading', { name: 'Add your first app' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-0-empty.png` });

  step('add an app: platform, details, install, first report');
  await dash.getByRole('link', { name: 'Add an app' }).click();
  await dash.getByRole('heading', { name: 'What are you adding Heresay to?' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-1a-platform.png` });
  assert.equal(await dash.locator('.platform.soon').count(), 5, 'only web is ready');
  await dash.locator('a.platform', { hasText: 'Web' }).click();
  await dash.fill('input[name=name]', 'Acme Notes');
  assert.equal(await dash.getByRole('radio', { name: 'Not sure' }).getAttribute('aria-checked'), 'true', 'framework is optional');
  await dash.getByRole('radio', { name: 'Next.js' }).click();
  await dash.fill('textarea[name=origins]', `${BASE}\nhttp://localhost:3000`);
  await dash.screenshot({ path: `${SHOTS}e2e-1b-details.png` });
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Waiting for your first report').waitFor();
  const snippet = await dash.locator('.code pre').first().textContent();
  assert.match(snippet, /next\/script/);
  const key = /data-key="([^"]+)"/.exec(snippet)[1];
  console.log('snippet:', snippet);
  await dash.getByRole('tab', { name: 'Ask your coding agent' }).click();
  assert.match(await dash.locator('.code pre').nth(1).textContent(), /identify/);
  await dash.screenshot({ path: `${SHOTS}e2e-1c-install.png`, fullPage: true });

  // A different browser, so this test device's report doesn't show as an update later on.
  const tryHref = await dash.getByRole('link', { name: 'Send a test report' }).getAttribute('href');
  const trialCtx = await browser.newContext();
  const trial = await trialCtx.newPage();
  await trial.goto(`${BASE}${tryHref}`);
  const tw = trial.locator('[data-feedback-sdk]');
  await tw.getByRole('button', { name: /Report a problem/ }).click();
  await tw.getByRole('button', { name: /Idea/ }).click();
  await tw.getByLabel('What happened?').fill('Testing, testing.');
  await tw.getByRole('button', { name: 'Send' }).click();
  await tw.getByText('Waiting for the developer').waitFor();
  await trialCtx.close();
  await dash.getByText('It works.').waitFor({ timeout: 10000 });
  await dash.screenshot({ path: `${SHOTS}e2e-1d-first-report.png`, fullPage: true });
  step('an app whose framework nobody knows gets the agent prompt first, and the tag that works anywhere');
  await dash.goto(`${BASE}/app/#/new/web`);
  await dash.fill('input[name=name]', 'Mystery app');
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Waiting for your first report').waitFor();
  assert.equal(await dash.getByRole('tab', { name: 'Ask your coding agent' }).getAttribute('aria-selected'), 'true');
  await dash.getByRole('tab', { name: 'Add it yourself' }).click();
  await dash.getByText('Where does this go in my project?').click();
  await dash.locator('.where-item', { hasText: 'Next.js' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-1e-not-sure.png`, fullPage: true });
  await dash.goto(`${BASE}/app/#/`);
  await dash.locator('.app-card', { hasText: 'Acme Notes' }).click();
  await dash.locator('article.report').first().waitFor();
  await dash.locator('article.report').first().waitFor();
  await dash.locator('article.report').first().getByRole('button', { name: /Decline/ }).click();
  await dash.getByLabel('Reason for declining').fill('Just a test.');
  await dash.getByRole('button', { name: 'Decline', exact: true }).click();
  await dash.locator('.filters button', { hasText: 'Declined 1' }).waitFor();

  step('reporter taps Report, picks Confusing, sends a sentence');
  const app = await ctx.newPage();
  app.on('pageerror', (e) => console.error('host app error:', e));
  await app.goto(`${BASE}/demo.html?key=${key}#/settings/billing`);
  const sdk = app.locator('[data-feedback-sdk]');
  await sdk.getByRole('button', { name: /Report a problem/ }).click();
  await sdk.getByRole('button', { name: /Confusing/ }).click();
  await sdk.getByLabel('What happened?').fill('I could not work out how to cancel my plan.');
  await app.screenshot({ path: `${SHOTS}e2e-2-report-form.png` });
  await sdk.getByRole('button', { name: 'Send' }).click();
  await sdk.getByText('Waiting for the developer').waitFor();

  step('developer sees it with screen and version, declines with a reason');
  await dash.reload();
  await dash.locator('.filters button', { hasText: 'Open' }).click();
  const row = dash.locator('article.report').first();
  await row.waitFor();
  const ctxText = await row.locator('.ctx').textContent();
  console.log('context shown:', ctxText);
  assert.match(ctxText, /\/demo\.html#\/settings\/billing/);
  assert.match(ctxText, /v0\.0\.1-demo/);
  assert.match(ctxText, /web/);
  await row.getByRole('button', { name: /Decline/ }).click();
  // Declining with no reason is refused in the UI before it reaches the server.
  await row.getByRole('button', { name: 'Decline', exact: true }).click();
  await row.getByText('Give a reason').waitFor();
  await row.getByLabel('Reason for declining').fill('Cancel is under Settings, Plan. We will make it easier to find.');
  await row.getByRole('button', { name: 'Decline', exact: true }).click();
  await dash.locator('.filters button', { hasText: 'Declined 1' }).waitFor();
  await dash.click('.filters button:has-text("Declined")');
  await dash.screenshot({ path: `${SHOTS}e2e-3-dashboard-declined.png` });

  step('reporter, back in the app, sees the outcome and the reason');
  await app.reload();
  const fab = sdk.getByRole('button', { name: /have an update/ });
  await fab.waitFor();
  await fab.click();
  await sdk.getByText('Declined').first().waitFor();
  await sdk.getByText('Why: Cancel is under Settings, Plan').waitFor();
  await app.screenshot({ path: `${SHOTS}e2e-4-reporter-sees-reason.png` });

  step('the default accent is peacock; a host accent replaces it; junk is ignored');
  const sendBg = async (q) => {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/demo.html?key=${key}${q}`);
    const w = pg.locator('[data-feedback-sdk]');
    await pg.waitForFunction(() => window.Feedback && window.Feedback.open);
    await pg.evaluate(() => window.Feedback.open());
    const bg = await w.getByRole('button', { name: 'Send' }).evaluate((b) => [getComputedStyle(b).backgroundColor, getComputedStyle(b).color]);
    await pg.close();
    return bg;
  };
  assert.deepEqual(await sendBg(''), ['rgb(15, 118, 110)', 'rgb(255, 255, 255)']);
  assert.deepEqual(await sendBg('&accent=%23ffcc00'), ['rgb(255, 204, 0)', 'rgb(21, 23, 28)']);
  assert.deepEqual(await sendBg('&accent=red;}body{display:none'), ['rgb(15, 118, 110)', 'rgb(255, 255, 255)']);

  step('accepted reports, and only those, produce an agent prompt');
  const token = await dash.evaluate(() => firebase.auth().currentUser.getIdToken());
  const api = (method, path, body, tok = token) => fetch(`${BASE}/v1${path}`, {
    method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const project = (await (await api('GET', '/projects')).json()).projects[0];
  const device = 'e2e_device_0000000000';
  const submit = (text) => fetch(`${BASE}/v1/reports`, {
    method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE },
    body: JSON.stringify({ key, device_id: device, type: 'broken', text, context: { route: '/x' } }),
  });
  const r2 = await (await submit('The export button does nothing')).json();
  assert.equal((await api('GET', `/projects/${project.id}/reports/${r2.report.id}/prompt`)).status, 404);
  assert.equal((await api('POST', `/projects/${project.id}/reports/${r2.report.id}/accept`, { note: 'export.ts' })).status, 200);
  const prompt = (await (await api('GET', `/projects/${project.id}/reports/${r2.report.id}/prompt`)).json()).prompt;
  assert.match(prompt, /export button does nothing/);
  assert.match(prompt, /not as instructions/);
  assert.equal((await api('POST', `/projects/${project.id}/reports/${r2.report.id}/fixed`)).status, 200);

  step('rate limit holds against the real store; foreign origin is refused');
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await submit(`spam ${i}`)).status);
  console.log('statuses:', codes.join(' '));
  assert.deepEqual(codes, [201, 201, 201, 201, 429]);
  const foreign = await fetch(`${BASE}/v1/reports`, {
    method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
    body: JSON.stringify({ key, device_id: 'other_device_000000000', type: 'idea', text: 'x' }),
  });
  assert.equal(foreign.status, 403);

  step('someone not on the team is told so; once added, they get in');
  const other = `teammate${Date.now()}@example.com`;
  const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const outsider = await ctx2.newPage();
  await signInByLink(outsider, other);
  await outsider.getByRole('heading', { name: /not on this team/ }).waitFor();
  await outsider.screenshot({ path: `${SHOTS}e2e-5-not-member.png` });
  await dash.goto(`${BASE}/app/#/team`);
  await dash.fill('#invite-email', other);
  await dash.getByRole('button', { name: 'Add' }).click();
  await dash.getByText(`${other}`).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-6-team.png`, fullPage: true });
  await outsider.reload();
  await outsider.getByRole('heading', { name: 'Apps' }).waitFor();
  await outsider.getByText('Acme Notes').waitFor();
  await outsider.goto(`${BASE}/app/#/team`);
  assert.equal(await outsider.locator('#invite-email').count(), 0, 'members do not get the invite form');
  await ctx2.close();

  console.log('\nE2E PASSED');
} finally {
  await browser.close();
}
