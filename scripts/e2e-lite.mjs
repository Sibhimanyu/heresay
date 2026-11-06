// Lite hosting, end to end in a real, visible browser: the Node server (no Cloud Functions, no
// Firebase Hosting) in front of the Auth and Firestore emulators. An owner signs in and adds an
// app, a reporter sends a report from the SDK, the owner declines it with a reason, and the
// reporter sees the reason. The same journey as e2e.mjs, on the Spark-compatible server.
//
// Run with `npm --prefix functions run build && firebase emulators:exec --only auth,firestore
// 'node scripts/e2e-lite.mjs'`. Screenshots land in .context/.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 5066;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT = 'demo-feedback-sdk';
const OWNER = `owner${Date.now()}@example.com`;
const SHOTS = new URL('../.context/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const step = (s) => console.log(`\n== ${s}`);

const server = spawn('node', ['functions/lib/providers/firebase/node-server.js'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env, PORT: String(PORT), GCLOUD_PROJECT: PROJECT, HERESAY_ORIGIN: BASE,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
    HERESAY_FIREBASE_CONFIG: JSON.stringify({ apiKey: 'fake', projectId: PROJECT, authDomain: '127.0.0.1' }),
  },
});
for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/v1/health`)).ok) break; } catch { /* not up yet */ }
  if (i > 50) throw new Error('the Lite server did not start');
  await new Promise((r) => setTimeout(r, 200));
}

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

const browser = await chromium.launch({ headless: false });
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  await seedOwner(OWNER);

  step('owner signs in with an email link on the Lite server');
  const dash = await ctx.newPage();
  dash.on('pageerror', (e) => { throw e; });
  await dash.route('https://registry.npmjs.org/**', (r) => r.fulfill({ json: { version: '0.0.0' } }));
  await dash.goto(`${BASE}/app/`);
  await dash.locator('#gate').waitFor();
  await dash.fill('#link-email', OWNER);
  await dash.click('#link-form button');
  await dash.getByText(`Check your inbox at ${OWNER}`).waitFor();
  const codes = (await (await fetch(`http://127.0.0.1:9199/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes;
  const code = codes.filter((c) => c.email === OWNER && c.requestType === 'EMAIL_SIGNIN').pop();
  assert.ok(code, 'the emulator sent a sign-in link');
  await dash.goto(`${BASE}/app/?mode=signIn&oobCode=${code.oobCode}&apiKey=fake&lang=en`);
  await dash.getByRole('heading', { name: 'Add your first app' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}lite-0-signed-in.png` });

  step('add an app and get its key');
  await dash.getByRole('link', { name: 'Add an app' }).click();
  await dash.locator('a.platform', { hasText: 'Web' }).click();
  await dash.fill('input[name=name]', 'Lite Notes');
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  const snippet = await dash.locator('.code pre').first().textContent();
  assert.ok(snippet.includes(`${BASE}/sdk/v1.js`), 'the tag points at the Lite server');
  const key = /data-key="([^"]+)"/.exec(snippet)[1];
  await dash.screenshot({ path: `${SHOTS}lite-1-app-added.png`, fullPage: true });

  step('reporter sends a report from the SDK');
  const app = await ctx.newPage();
  app.on('pageerror', (e) => { throw e; });
  await app.goto(`${BASE}/demo.html?key=${key}#/settings/billing`);
  const sdk = app.locator('[data-feedback-sdk]');
  await sdk.getByRole('button', { name: /Report a problem/ }).click();
  await sdk.getByRole('button', { name: /Confusing/ }).click();
  await sdk.getByLabel('What happened?').fill('I could not work out how to cancel my plan.');
  await sdk.getByRole('button', { name: 'Send' }).click();
  await sdk.getByText('Waiting for the developer').waitFor();
  await app.screenshot({ path: `${SHOTS}lite-2-reported.png` });

  step('owner declines it with a reason');
  await dash.goto(`${BASE}/app/#/apps`);
  await dash.locator('.app-card', { hasText: 'Lite Notes' }).click();
  await dash.locator('.status-tabs button', { hasText: 'Open' }).click();
  const row = dash.locator('article.report').first();
  await row.waitFor();
  await row.getByRole('button', { name: /Decline/ }).click();
  await row.getByLabel('Reason for declining').fill('Cancel is under Settings, Plan.');
  await row.getByRole('button', { name: 'Decline', exact: true }).click();
  await dash.locator('.toast.on', { hasText: 'Declined' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}lite-3-declined.png` });

  step('reporter sees the outcome and the reason');
  await app.reload();
  await sdk.getByRole('button', { name: /have an update/ }).click();
  await sdk.getByText('Why: Cancel is under Settings, Plan.').waitFor();
  await app.screenshot({ path: `${SHOTS}lite-4-reporter-sees-reason.png` });

  console.log('\nLite e2e passed');
} finally {
  await browser.close();
  server.kill();
}
