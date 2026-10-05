// Run with npm run e2e:notifications. Settings persist through the real API/Firestore;
// delivery is stubbed only for the browser's test button (HTTP transport has unit tests).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5055';
const AUTH = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1';
const SHOTS = new URL('../.context/', import.meta.url).pathname;
const OWNER = `notifications${Date.now()}@example.com`;
const MEMBER = `notifications-member${Date.now()}@example.com`;
const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz_123456';
mkdirSync(SHOTS, { recursive: true });
const at = new Date().toISOString();
const seed = await fetch('http://127.0.0.1:8181/v1/projects/demo-feedback-sdk/databases/(default)/documents/meta/instance', {
  method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
  body: JSON.stringify({ fields: {
    created_at: { stringValue: at }, members: { arrayValue: { values: [OWNER, MEMBER].map((email, i) => ({ mapValue: { fields: {
      email: { stringValue: email }, role: { stringValue: i ? 'member' : 'owner' }, added_at: { stringValue: at }, added_by: { nullValue: null },
    } } })) } },
  } }),
});
assert.ok(seed.ok, await seed.text());
async function signIn(page, email) {
  await page.goto(BASE + '/app/');
  await page.fill('#link-email', email);
  await page.click('#link-form button');
  await page.getByText('Check your inbox at').waitFor();
  const codes = await (await fetch('http://127.0.0.1:9199/emulator/v1/projects/demo-feedback-sdk/oobCodes')).json();
  const code = codes.oobCodes.filter((c) => c.email === email).pop();
  assert.ok(code);
  await page.goto(`${BASE}/app/?mode=signIn&oobCode=${code.oobCode}&apiKey=fake&lang=en`);
  await page.locator('#app').waitFor({ state: 'visible' });
}
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://registry.npmjs.org/create-heresay/latest', (route) => route.fulfill({ json: { version: '0.0.0' } }));
  await signIn(page, OWNER);
  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await page.getByRole('heading', { name: 'When to notify' }).waitFor();
  assert.equal(await page.locator('[data-nav=notifications]').getAttribute('aria-current'), 'true');
  assert.equal(await page.locator('[data-nav=apps]').getAttribute('aria-current'), 'false');
  const events = page.locator('section').filter({ has: page.getByRole('heading', { name: 'When to notify' }) });
  const telegram = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Telegram', exact: true }) });
  const cliq = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Zoho Cliq', exact: true }) });
  assert.equal(await telegram.getByRole('button', { name: 'Send test notification' }).isDisabled(), true);
  assert.equal(await events.locator('[name=new_report]').isChecked(), true);
  assert.equal(await events.locator('[name=accepted]').isChecked(), false);
  await events.locator('[name=accepted]').check();
  await events.getByRole('button', { name: 'Save events' }).click();
  await events.getByText('Notification events saved.').waitFor();

  await telegram.getByRole('checkbox').check();
  await telegram.getByRole('button', { name: 'Save Telegram' }).click();
  await telegram.getByText('Telegram needs a bot token and a chat ID.').waitFor();
  await telegram.locator('[name=telegram_token]').fill(TOKEN);
  await telegram.locator('[name=chat_id]').fill('-1001234567890');
  await telegram.getByRole('button', { name: 'Save Telegram' }).click();
  await telegram.getByText('Telegram settings saved. Send a test to check delivery.').waitFor();
  assert.equal(await telegram.locator('[name=telegram_token]').inputValue(), '');
  assert.equal(await telegram.getByRole('button', { name: 'Send test notification' }).isEnabled(), true);
  await page.reload();
  await page.getByRole('heading', { name: 'When to notify' }).waitFor();
  assert.equal(await telegram.getByRole('checkbox').isChecked(), true);
  assert.equal(await events.locator('[name=accepted]').isChecked(), true);
  assert.equal(await telegram.locator('[name=chat_id]').inputValue(), '-1001234567890');
  assert.equal(await telegram.locator('[name=telegram_token]').inputValue(), '');
  await telegram.locator('[name=chat_id]').fill('@teamchannel');
  assert.equal(await telegram.getByRole('button', { name: 'Send test notification' }).isDisabled(), true);
  const saveResponse = page.waitForResponse((r) => r.url().endsWith('/v1/notifications') && r.request().method() === 'PATCH');
  await telegram.getByRole('button', { name: 'Save Telegram' }).click();
  const response = await saveResponse;
  const saved = await response.json();
  assert.equal(saved.notifications.telegram.configured, true, 'blank token retains saved credential');
  assert.ok(!JSON.stringify(saved).includes(TOKEN));
  await telegram.getByText('Telegram settings saved. Send a test to check delivery.').waitFor();

  let testBody;
  await page.route('**/v1/notifications/test', async (route) => {
    testBody = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await telegram.getByRole('button', { name: 'Send test notification' }).click();
  await telegram.getByText('Test notification sent. Check Telegram.').waitFor();
  assert.deepEqual(testBody, { provider: 'telegram' });
  await page.unroute('**/v1/notifications/test');
  await page.route('**/v1/notifications/test', (route) => route.fulfill({ status: 502, json: { error: 'Test could not be delivered. Check the token, destination, and bot permissions, then try again.' } }));
  await telegram.getByRole('button', { name: 'Send test notification' }).click();
  await telegram.getByText('Test could not be delivered.', { exact: false }).waitFor();
  assert.equal(await telegram.getByRole('button', { name: 'Send test notification' }).isEnabled(), true);

  await cliq.getByRole('checkbox').check();
  await cliq.locator('[name=cliq_token]').fill('cliq-test-token');
  await cliq.locator('[name=endpoint]').fill('https://example.com/webhook');
  await cliq.getByRole('button', { name: 'Save Zoho Cliq' }).click();
  await cliq.getByText('Use a Zoho Cliq bot or channel message endpoint, without a query string.').waitFor();
  await cliq.locator('[name=endpoint]').fill('https://cliq.zoho.in/api/v2/channelsbyname/team/message');
  await cliq.getByRole('button', { name: 'Save Zoho Cliq' }).click();
  await cliq.getByText('Zoho Cliq settings saved. Send a test to check delivery.').waitFor();
  await page.unroute('**/v1/notifications/test');
  await page.route('**/v1/notifications/test', (route) => {
    testBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await cliq.getByRole('button', { name: 'Send test notification' }).click();
  await cliq.getByText('Test notification sent. Check Zoho Cliq.').waitFor();
  assert.deepEqual(testBody, { provider: 'cliq' });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: SHOTS + 'notifications-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile has no horizontal overflow');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: SHOTS + 'notifications-mobile.png', fullPage: true });

  // A disabled destination keeps its credential so it can be re-enabled without re-entry.
  await telegram.getByRole('checkbox').uncheck();
  await telegram.getByRole('button', { name: 'Save Telegram' }).click();
  await telegram.getByText('Telegram settings saved. Send a test to check delivery.').waitFor();
  assert.equal(await telegram.getByRole('button', { name: 'Send test notification' }).isDisabled(), true);
  await cliq.getByRole('button', { name: 'Disconnect' }).click();
  await cliq.getByText('Zoho Cliq disconnected. The saved token was removed.').waitFor();
  assert.equal(await cliq.locator('[name=endpoint]').inputValue(), '');
  await telegram.getByRole('button', { name: 'Disconnect' }).click();
  await telegram.getByText('Telegram disconnected. The saved token was removed.').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'When to notify' }).waitFor();
  assert.equal(await telegram.getByRole('button', { name: 'Disconnect' }).isDisabled(), true);
  assert.equal(await cliq.getByRole('button', { name: 'Disconnect' }).isDisabled(), true);

  let fail = true;
  await page.route('**/v1/notifications', async (route) => {
    if (fail && route.request().method() === 'GET') return route.fulfill({ status: 500, json: { error: 'Settings temporarily unavailable' } });
    await route.continue();
  });
  await page.reload();
  await page.getByText('Settings temporarily unavailable').waitFor();
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('heading', { name: 'When to notify' }).waitFor();
  assert.deepEqual(errors, []);

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signIn(member, MEMBER);
  await member.getByRole('link', { name: 'Notifications', exact: true }).click();
  await member.getByText('An owner can connect Telegram or Zoho Cliq').waitFor();
  assert.equal(await member.getByRole('button', { name: 'Save Telegram' }).count(), 0);
  await memberContext.close();
  await context.close();
  console.log('Notification UI: settings persistence, validation, tests, disconnection, retry, member access, and mobile layout passed.');
} finally { await browser.close(); }
