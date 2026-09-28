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

async function devUser() {
  const email = `dev${Date.now()}@example.com`;
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
  });
  const b = await r.json();
  assert.ok(b.idToken, JSON.stringify(b));
  return { email, token: b.idToken };
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const dev = await devUser();

  step('developer creates a project in the dashboard');
  const dash = await ctx.newPage();
  dash.on('pageerror', (e) => console.error('dashboard error:', e));
  await dash.goto(`${BASE}/app/`);
  await dash.waitForFunction(() => window.firebase && firebase.auth);
  await dash.evaluate(([e, p]) => firebase.auth().signInWithEmailAndPassword(e, p), [dev.email, 'password123']);
  await dash.locator('#create').waitFor();
  await dash.fill('#create-form input[name=name]', 'Acme Notes');
  await dash.fill('#create-form input[name=origin]', BASE);
  await dash.click('#create-form button');
  await dash.locator('#setup').waitFor();
  const snippet = await dash.textContent('#snippet');
  const key = /data-key="([^"]+)"/.exec(snippet)[1];
  console.log('snippet:', snippet);
  await dash.screenshot({ path: `${SHOTS}e2e-1-setup.png` });

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
  const api = (method, path, body) => fetch(`${BASE}/v1${path}`, {
    method, headers: { authorization: `Bearer ${dev.token}`, 'content-type': 'application/json' },
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

  console.log('\nE2E PASSED');
} finally {
  await browser.close();
}
