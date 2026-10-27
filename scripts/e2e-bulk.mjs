// Choosing several open reports and accepting them together, against the real Firebase emulators.
// A visible window by default (E2E_HEADLESS=1 for none): npm run e2e:bulk
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const BASE = 'http://127.0.0.1:5055';
const PROJECT = 'demo-feedback-sdk';
const email = `bulk${Date.now()}@example.com`;
const stamp = new Date().toISOString();
const shot = new URL('../.context/', import.meta.url).pathname;
mkdirSync(shot, { recursive: true });
const seeded = await fetch(`http://127.0.0.1:8181/v1/projects/${PROJECT}/databases/(default)/documents/meta/instance`, {
  method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
  body: JSON.stringify({ fields: { created_at: { stringValue: stamp }, members: { arrayValue: { values: [{ mapValue: { fields: {
    email: { stringValue: email }, role: { stringValue: 'owner' }, added_at: { stringValue: stamp }, added_by: { nullValue: null },
  } } }] } } } }),
});
assert.equal(seeded.status, 200);
const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS === '1' });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('https://registry.npmjs.org/create-heresay/latest', r => r.fulfill({ json: { version: '0.0.0' } }));
try {
  await page.goto(`${BASE}/app/`);
  await page.locator('#gate').waitFor();
  await page.fill('#link-email', email);
  await page.click('#link-form button');
  await page.getByText(`Check your inbox at ${email}`).waitFor();
  const codes = (await (await fetch(`http://127.0.0.1:9199/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes;
  const code = codes.filter(c => c.email === email).pop();
  await page.goto(`${BASE}/app/?mode=signIn&oobCode=${code.oobCode}&apiKey=fake&lang=en`);
  await page.locator('#app').waitFor();
  const token = await page.evaluate(() => firebase.auth().currentUser.getIdToken());
  const api = async (method, path, body) => {
    const r = await fetch(`${BASE}/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const b = await r.json(); assert.ok(r.ok, JSON.stringify(b)); return b;
  };
  const app = (await api('POST', '/projects', { name: 'Fieldnotes', platform: 'web', allowed_origins: [BASE] })).project;
  const texts = ['Export drops the last row', 'Dark mode flickers on load', 'Search ignores accents', 'Share link 404s', 'Cannot rename a folder'];
  for (const text of texts) {
    const r = await fetch(`${BASE}/v1/reports`, { method: 'POST', headers: { origin: BASE, 'content-type': 'text/plain' },
      body: JSON.stringify({ key: app.key, device_id: 'bulk_' + crypto.randomUUID(), type: 'broken', text, context: { platform: 'web', route: '/' } }) });
    assert.ok(r.ok, await r.text());
  }
  const statuses = async () => (await api('GET', `/projects/${app.id}/reports`)).reports.reduce((m, r) => (m[r.status] = (m[r.status] ?? 0) + 1, m), {});

  await page.goto(`${BASE}/app/#/apps/${app.id}`);
  await page.locator('.report-preview').first().waitFor();
  assert.equal(await page.locator('.report-row .pick').count(), 0, 'no tick boxes until asked');
  await page.getByRole('button', { name: 'Select reports…' }).click();
  assert.equal(await page.locator('.report-row .pick input').count(), 5);
  assert.equal(await page.getByRole('button', { name: /^Accept…$/ }).isDisabled(), true, 'nothing chosen, nothing to accept');

  await page.getByLabel('Select all 5 open reports').click();
  await page.getByText('5 selected').waitFor();
  await page.locator('.report-row .pick input').nth(1).click();
  await page.locator('.report-row .pick input').nth(3).click();
  await page.getByText('3 selected').waitFor();
  assert.equal(await page.getByLabel('Select all 5 open reports').evaluate(n => n.indeterminate), true, 'some, not all');
  await page.getByLabel('Select all 5 open reports').click();
  await page.getByText('5 selected').waitFor();
  await page.getByLabel('Select all 5 open reports').click();
  await page.getByText('None selected').waitFor();

  await page.locator('.report-row .pick input').nth(0).click();
  await page.locator('.report-row .pick input').nth(2).click({ modifiers: ['Shift'] });
  await page.getByText('3 selected').waitFor();
  await page.screenshot({ path: `${shot}bulk-1-picking.png` });

  await page.getByRole('button', { name: 'Accept 3…' }).click();
  await page.getByText('Make 3 reports available to a coding agent?').waitFor();
  assert.deepEqual(await statuses(), { open: 5 }, 'nothing happens before the second click');
  await page.screenshot({ path: `${shot}bulk-2-confirm.png` });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText('3 selected').waitFor();
  await page.getByRole('button', { name: 'Accept 3…' }).click();
  await page.getByRole('button', { name: 'Yes, accept 3' }).click();
  await page.getByText('Accepted 3 reports.').waitFor();
  assert.deepEqual(await statuses(), { open: 2, accepted: 3 });
  await page.waitForFunction(() => document.querySelectorAll('.report-row').length === 2);
  await page.screenshot({ path: `${shot}bulk-3-accepted.png` });

  await page.locator('.status-tabs button[data-status=accepted]').click();
  assert.equal(await page.getByRole('button', { name: 'Select reports…' }).count(), 0, 'accepting is for open reports');
  assert.deepEqual(errors, []);
  console.log('bulk accept: ok');
} finally {
  await browser.close();
}
