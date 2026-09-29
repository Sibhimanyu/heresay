// The first milestone, end to end, against the emulators and a real browser:
// a reporter taps Report, picks Confusing, sends a sentence; the developer sees it with the
// screen and version attached and declines it with a reason; the reporter sees the reason.
//
// Run with `npm run e2e` (it starts and stops the emulators). Screenshots land in .context/.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';

const BASE = 'http://127.0.0.1:5055';
const AUTH = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1';
const SHOTS = new URL('../.context/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const step = (s) => console.log(`\n== ${s}`);

// A stand-in for the customer's own site, on a different origin from Heresay, carrying the tag.
const CUSTOMER = 'http://127.0.0.1:5077';
let customerKey = '';
const customer = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>Acme Notes</title><h1>Acme Notes</h1><script src="${BASE}/sdk/v1.js" data-key="${customerKey}" defer></script>`);
}).listen(5077, '127.0.0.1');
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

  step('add an app: platform, details, install; verified automatically when the app loads it');
  await dash.getByRole('link', { name: 'Add an app' }).click();
  await dash.getByRole('heading', { name: 'What are you adding Heresay to?' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-1a-platform.png` });
  assert.equal(await dash.locator('.platform.soon').count(), 3, 'web, iOS and macOS are ready');
  await dash.locator('a.platform', { hasText: 'Web' }).click();
  await dash.fill('input[name=name]', 'Acme Notes');
  assert.equal(await dash.getByRole('radiogroup', { name: 'Framework' }).getByRole('radio', { name: 'Not sure' }).getAttribute('aria-checked'), 'true', 'framework is optional');
  await dash.getByRole('radio', { name: 'Next.js' }).click();
  await dash.getByRole('radio', { name: 'Yes, they sign in' }).click();
  await dash.fill('textarea[name=origins]', `${CUSTOMER}\nhttp://localhost:3000`);
  await dash.screenshot({ path: `${SHOTS}e2e-1b-details.png` });
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  assert.equal(await dash.getByRole('button', { name: 'Continue to reports' }).isDisabled(), true, 'no moving on before it is verified');
  const snippet = await dash.locator('.code pre').first().textContent();
  assert.match(snippet, /next\/script/);
  const key = /data-key="([^"]+)"/.exec(snippet)[1];
  assert.ok(await dash.locator('.code pre').filter({ hasText: 'identify({ id: user.id, label: user.name, email: user.email })' }).count(), 'signed-in apps get the identify step');
  console.log('snippet:', snippet);

  step('the steps before this one are links: going back edits the same app, and the key stays');
  await dash.getByRole('link', { name: 'Back to Details' }).click();
  assert.equal(await dash.inputValue('input[name=name]'), 'Acme Notes');
  assert.match(await dash.inputValue('textarea[name=origins]'), /localhost:3000/);
  assert.equal(await dash.getByRole('radio', { name: 'Next.js' }).getAttribute('aria-checked'), 'true');
  await dash.getByRole('button', { name: 'Save and continue' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  assert.ok((await dash.locator('.code pre').first().textContent()).includes(key), 'same key after editing');
  const apps = (await (await fetch(`${BASE}/v1/projects`, { headers: { authorization: `Bearer ${await dash.evaluate(() => firebase.auth().currentUser.getIdToken())}` } })).json()).projects;
  assert.equal(apps.length, 1, 'going back did not create a second app');

  step('one prompt for the coding agent: connect, install, verify');
  assert.equal(await dash.getByRole('tab', { name: 'Ask your coding agent' }).getAttribute('aria-selected'), 'true', 'the agent route comes first');
  assert.equal(await dash.getByText('No MCP?').count(), 0);
  await dash.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await dash.getByRole('button', { name: 'Copy prompt' }).click();
  await dash.getByText('Copied. Paste it into your coding agent').waitFor();
  assert.equal(await dash.locator('.code pre').filter({ hasText: 'Set up Heresay' }).count(), 0, 'the prompt is copied, not shown');
  const onePrompt = await dash.evaluate(() => navigator.clipboard.readText());
  assert.match(onePrompt, /heresay@latest connect --url .+ --token hst_[A-Za-z0-9_-]+ --yes/);
  assert.match(onePrompt, new RegExp(`heresay@latest install ${apps[0].id}`));
  assert.match(onePrompt, new RegExp(`heresay@latest check ${apps[0].id}`));

  step('going back to explore and returning copies the same prompt, not a second token');
  await dash.getByRole('link', { name: 'Back to Details' }).click();
  await dash.getByRole('button', { name: 'Save and continue' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  await dash.getByRole('button', { name: 'Copy prompt' }).click();
  await dash.getByText('Copied. Paste it into your coding agent').waitFor();
  assert.equal(await dash.evaluate(() => navigator.clipboard.readText()), onePrompt, 'same token after navigating away');
  const tokenList = (await (await fetch(`${BASE}/v1/agent-tokens`, { headers: { authorization: `Bearer ${await dash.evaluate(() => firebase.auth().currentUser.getIdToken())}` } })).json()).tokens;
  assert.equal(tokenList.filter((t) => t.app_ids.includes(apps[0].id)).length, 1, 'one prompt token for the app');
  await dash.getByText('Prefer to run the command yourself?').click();
  await dash.getByText(`npx heresay connect --url ${BASE}`).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-1c-install.png`, fullPage: true });

  step('the customer\'s app loads Heresay: the dashboard sees it running, and Continue unlocks');
  customerKey = key;
  const custCtx = await browser.newContext();
  const cust = await custCtx.newPage();
  await cust.goto(`${CUSTOMER}/`);
  await cust.locator('[data-feedback-sdk]').getByRole('button', { name: /Report a problem/ }).waitFor();
  await dash.getByText(`Seen on ${CUSTOMER}`).waitFor({ timeout: 15000 });
  await dash.getByText('Installed.').waitFor();
  assert.equal(await dash.getByRole('button', { name: 'Continue to reports' }).isDisabled(), false);
  await dash.screenshot({ path: `${SHOTS}e2e-1d-verified.png`, fullPage: true });
  await custCtx.close();

  step('an app whose framework nobody knows gets the agent prompt first, and the tag that works anywhere');
  await dash.goto(`${BASE}/app/#/new/web`);
  await dash.fill('input[name=name]', 'Mystery app');
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  assert.equal(await dash.getByRole('tab', { name: 'Ask your coding agent' }).getAttribute('aria-selected'), 'true');
  await dash.getByRole('tab', { name: 'Add it yourself' }).click();
  await dash.getByText('Where does this go in my project?').click();
  await dash.locator('.where-item', { hasText: 'Next.js' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-1e-not-sure.png`, fullPage: true });

  step('the apps list sends an unverified app back to finish setup');
  await dash.goto(`${BASE}/app/#/`);
  await dash.locator('.app-card', { hasText: 'Mystery app' }).getByText('Setup not finished').waitFor();
  await dash.locator('.app-card', { hasText: 'Mystery app' }).click();
  await dash.getByText('Checking automatically…').waitFor();

  step('deleting an app: removal steps for the repo first, then type the name');
  const mysteryId = /#\/apps\/([^/]+)\/setup/.exec(dash.url())[1];
  await dash.goto(`${BASE}/app/#/apps/${mysteryId}/delete`);
  await dash.getByRole('heading', { name: 'Delete Mystery app' }).waitFor();
  const removal = await dash.locator('.code pre').first().textContent();
  assert.match(removal, /heresay@latest disconnect --yes/);
  assert.match(removal, /guide uninstall/);
  const del = dash.getByRole('button', { name: 'Delete Mystery app' });
  assert.equal(await del.isDisabled(), true);
  await dash.fill('input[name=confirm]', 'Mystery app');
  await dash.screenshot({ path: `${SHOTS}e2e-1g-delete.png`, fullPage: true });
  await del.click();
  await dash.getByRole('heading', { name: 'Apps' }).waitFor();
  assert.equal(await dash.locator('.app-card', { hasText: 'Mystery app' }).count(), 0);
  await dash.locator('.app-card', { hasText: 'Acme Notes' }).waitFor();

  step('reporter taps Report, picks Confusing, sends a sentence');
  const app = await ctx.newPage();
  app.on('pageerror', (e) => console.error('host app error:', e));
  await app.goto(`${BASE}/demo.html?key=${key}#/settings/billing`);
  const sdk = app.locator('[data-feedback-sdk]');
  await sdk.getByRole('button', { name: /Report a problem/ }).click();

  step('an anonymous reporter sets preferences once: name, email, a setup note');
  await sdk.getByRole('tab', { name: 'Preferences' }).click();
  await sdk.getByLabel('Your name').fill('Asha');
  await sdk.getByLabel('Email').fill('not-an-email');
  await sdk.getByRole('button', { name: 'Save' }).click();
  await sdk.getByText('That email does not look right.').waitFor();
  await sdk.getByLabel('Email').fill('asha@example.org');
  await sdk.getByLabel('About your setup').fill('I use a screen reader.');
  await sdk.getByRole('button', { name: 'Save' }).click();
  await sdk.getByText('Saved on this device.').waitFor();
  await app.screenshot({ path: `${SHOTS}e2e-2a-preferences.png` });
  assert.equal(await sdk.getByText('Button position').count(), 0, 'where the button sits is the developer\'s choice');
  await sdk.getByRole('tab', { name: 'Report', exact: true }).click();
  await sdk.getByText('your preferences are attached').waitFor();
  await sdk.getByRole('button', { name: /Confusing/ }).click();
  await sdk.getByLabel('What happened?').fill('I could not work out how to cancel my plan.');
  await app.screenshot({ path: `${SHOTS}e2e-2-report-form.png` });
  await sdk.getByRole('button', { name: 'Send' }).click();
  await sdk.getByText('Waiting for the developer').waitFor();

  step('developer sees it with screen and version, declines with a reason');
  await dash.goto(`${BASE}/app/#/`);
  await dash.locator('.app-card', { hasText: 'Acme Notes' }).click();
  await dash.locator('.filters button', { hasText: 'Open' }).click();
  const row = dash.locator('article.report').first();
  await row.waitFor();
  const ctxText = await row.locator('.ctx').first().textContent();
  console.log('context shown:', ctxText);
  assert.match(ctxText, /\/demo\.html#\/settings\/billing/);
  assert.match(ctxText, /v0\.0\.1-demo/);
  assert.match(ctxText, /web/);
  assert.match(ctxText, /Heresay test page/, 'page title');
  assert.match(ctxText, /\d+x\d+/, 'viewport');
  await row.getByText('From: Asha · asha@example.org').waitFor();
  await row.getByText('About their setup: I use a screen reader.').waitFor();
  await row.getByRole('link', { name: `${BASE}/demo.html#/settings/billing` }).waitFor();
  assert.equal(await row.getByText('?key=').count(), 0, 'the query string is not sent');
  await dash.screenshot({ path: `${SHOTS}e2e-2b-dashboard-prefs.png` });
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

  step('a signed-in reporter is never asked their name: the app says who it is');
  const signed = await ctx.newPage();
  await signed.goto(`${BASE}/demo.html?key=${key}#/home`);
  await signed.waitForFunction(() => window.Heresay && window.Heresay.identify);
  await signed.evaluate(() => window.Heresay.identify({ id: 'u_42', label: 'Sibhi Govindasamy', email: 'sibhi@example.com' }));
  await signed.evaluate(() => window.Heresay.openPreferences());
  const sw = signed.locator('[data-feedback-sdk]');
  await sw.getByText('Signed in as Sibhi Govindasamy').waitFor();
  assert.equal(await sw.getByLabel('Your name').count(), 0, 'no name field when signed in');
  assert.equal(await sw.getByLabel('Email').count(), 0, 'no email field when signed in');
  await signed.screenshot({ path: `${SHOTS}e2e-2c-signed-in-prefs.png` });
  await sw.getByRole('tab', { name: 'Report', exact: true }).click();
  await sw.getByRole('button', { name: /Idea/ }).click();
  await sw.getByLabel('What happened?').fill('Dark mode for the calendar, please.');
  await sw.getByRole('button', { name: 'Send' }).click();
  await sw.getByText('Waiting for the developer').waitFor();
  await dash.reload();
  await dash.locator('.filters button', { hasText: 'Open' }).click();
  const sRow = dash.locator('article.report', { hasText: 'Dark mode for the calendar' });
  await sRow.getByText('Signed in: Sibhi Govindasamy · sibhi@example.com').waitFor();
  assert.equal(await sRow.getByText('Asha').count(), 0, 'what this device typed while signed out is not sent');
  await signed.close();

  step('the one-time introduction: a bubble says the button is there, once per device');
  const intro = await (await browser.newContext()).newPage();
  await intro.goto(`${BASE}/demo.html?key=${key}`);
  await intro.waitForFunction(() => window.Heresay && window.Heresay.introduce);
  assert.equal(await intro.evaluate(() => window.Heresay.introduce()), true);
  const iw = intro.locator('[data-feedback-sdk]');
  await iw.getByText('Something not right? Tell the team.').waitFor();
  await intro.waitForTimeout(400); // past the fade-in
  await intro.screenshot({ path: `${SHOTS}e2e-2d-introduce.png` });
  await iw.getByRole('button', { name: 'Try it' }).click();
  await iw.getByRole('button', { name: /Confusing/ }).waitFor();
  await intro.reload();
  await intro.waitForFunction(() => window.Heresay && window.Heresay.introduce);
  assert.equal(await intro.evaluate(() => window.Heresay.introduce()), false, 'never twice on a device');
  await intro.context().close();

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

  step('an iOS app gets Swift install steps, and no web-sites question');
  await dash.goto(`${BASE}/app/#/new/ios`);
  await dash.getByRole('heading', { name: 'About your iOS app' }).waitFor();
  assert.equal(await dash.locator('textarea[name=origins]').count(), 0);
  await dash.fill('input[name=name]', 'Acme iOS');
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  assert.equal(await dash.getByRole('tab', { name: 'Ask your coding agent' }).getAttribute('aria-selected'), 'true', 'agent first on iOS too');
  await dash.getByRole('button', { name: 'Copy prompt' }).click();
  await dash.getByText('Copied. Paste it into your coding agent').waitFor();
  assert.match(await dash.evaluate(() => navigator.clipboard.readText()), /a Swift package and one line of setup/);
  await dash.screenshot({ path: `${SHOTS}e2e-1f-ios-agent.png`, fullPage: true });
  await dash.getByRole('tab', { name: 'Add it yourself' }).click();
  await dash.getByText('File › Add Package Dependencies…').waitFor();
  const swift = await dash.locator('.code pre').nth(1).textContent();
  assert.match(swift, /Heresay\.configure\(key: "pk_/);
  assert.match(swift, /heresayReportButton\(\)/);
  assert.equal(await dash.getByRole('link', { name: 'Send a test report' }).count(), 0, 'no web test page for native apps');
  await dash.screenshot({ path: `${SHOTS}e2e-1f-ios-install.png`, fullPage: true });

  step('connect a repo for coding agents from the dashboard: the token is shown once');
  await dash.goto(`${BASE}/app/#/connect?repo=github.com/acme/notes&app=${project.id}`);
  await dash.getByRole('heading', { name: 'Connect a repo for your coding agent' }).waitFor();
  assert.equal(await dash.inputValue('input[name=repo]'), 'github.com/acme/notes');
  assert.equal(await dash.locator(`input[type=checkbox][value="${project.id}"]`).isChecked(), true, 'the app it came from is ticked');
  await dash.getByRole('button', { name: 'Create token' }).click();
  const shown = await dash.locator('.token-out pre').textContent();
  assert.match(shown, /^hst_/);
  await dash.locator('.members li', { hasText: 'github.com/acme/notes' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-7-connect.png`, fullPage: true });
  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.getByText('Agents fix these in: github.com/acme/notes').waitFor();

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
  customer.close();
} catch (e) {
  for (const [i, pg] of browser.contexts().flatMap((c) => c.pages()).entries()) {
    await pg.screenshot({ path: `${SHOTS}e2e-FAILED-${i}.png`, fullPage: true }).catch(() => {});
  }
  throw e;
} finally {
  await browser.close();
  customer.close();
}
