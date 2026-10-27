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
const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS === '1' });
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://registry.npmjs.org/create-heresay/latest', (route) => route.fulfill({ json: { version: '0.0.0' } }));
  await signIn(page, OWNER);
  await page.getByRole('link', { name: 'Notifications', exact: true }).click();
  await page.getByRole('heading', { name: 'What to send' }).waitFor();
  assert.equal(await page.locator('[data-nav=notifications]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('[data-nav=apps]').getAttribute('aria-current'), null);
  const events = page.locator('section').filter({ has: page.getByRole('heading', { name: 'What to send' }) });
  const telegram = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Telegram', exact: true }) });
  const cliq = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Zoho Cliq', exact: true }) });
  const pill = (box) => box.locator('.pill-state');
  assert.equal(await pill(telegram).textContent(), 'Not set up');
  assert.equal(await pill(cliq).textContent(), 'Not set up');
  assert.equal(await telegram.getByRole('button', { name: 'Send test' }).isHidden(), true, 'nothing to test before it is set up');
  assert.equal(await telegram.locator('form').isHidden(), true, 'the form stays closed until asked for');
  assert.equal(await events.locator('[name=new_report]').isChecked(), true);
  assert.equal(await events.locator('[name=accepted]').isChecked(), false);
  await events.locator('[name=accepted]').check();
  await events.getByText('✓ Saved').waitFor();

  await telegram.getByRole('button', { name: 'Set up' }).click();
  await telegram.getByRole('button', { name: 'Save', exact: true }).click();
  await telegram.getByText('Telegram needs a bot token and a chat ID.').waitFor();
  // Guided: pasting the token checks it, says what to tap, then watches the bot until the chat shows up.
  let lookupBody = null, chats = [];
  await page.route('**/v1/notifications/telegram/lookup', async (route) => {
    lookupBody = route.request().postDataJSON();
    await route.fulfill({ json: { bot: { username: 'acme_alerts_bot', name: 'Acme alerts' }, chats } });
  });
  await telegram.locator('[name=telegram_token]').fill(TOKEN);
  await telegram.getByText('Your bot is Acme alerts (@acme_alerts_bot).').waitFor();
  assert.deepEqual(lookupBody, { token: TOKEN });
  await telegram.getByRole('link', { name: 'Open @acme_alerts_bot in Telegram ↗' }).waitFor();
  await telegram.getByText('Waiting for your message to @acme_alerts_bot…').waitFor();
  await telegram.screenshot({ path: SHOTS + 'notifications-telegram-waiting.png' });
  // They press Start in Telegram; the next look finds their chat and picks it.
  chats = [{ id: '-1001234567890', title: 'Acme team', kind: 'supergroup' }, { id: '42', title: 'Asha R', kind: 'private' }];
  await telegram.getByText('Alerts will go to Asha R (private chat).').waitFor({ timeout: 15000 });
  assert.equal(await telegram.locator('[name=chat_id]').inputValue(), '42');
  await telegram.getByRole('tab', { name: 'A group' }).click();
  await telegram.getByRole('link', { name: 'Add @acme_alerts_bot to a group ↗' }).waitFor();
  await telegram.getByRole('radio', { name: /Acme team/ }).check();
  assert.equal(await telegram.locator('[name=chat_id]').inputValue(), '-1001234567890');
  await telegram.screenshot({ path: SHOTS + 'notifications-telegram-guide.png' });
  await telegram.getByRole('button', { name: 'Save', exact: true }).click();
  await telegram.getByText('Saved. Send a test to check it.').waitFor();
  assert.equal(await telegram.locator('[name=telegram_token]').inputValue(), '');
  assert.equal(await pill(telegram).textContent(), 'On', 'saving turns it on');
  assert.equal(await telegram.getByRole('button', { name: 'Send test' }).isEnabled(), true);
  await page.reload();
  await page.getByRole('heading', { name: 'What to send' }).waitFor();
  assert.equal(await pill(telegram).textContent(), 'On');
  assert.equal(await telegram.getByLabel('Telegram alerts on').isChecked(), true);
  assert.equal(await events.locator('[name=accepted]').isChecked(), true, 'the switch was saved');
  assert.equal(await telegram.locator('form').isHidden(), true);
  // Saved before the buttons existed, so the bot has no webhook: one tap puts it on, with the saved token kept.
  const turnOn = page.waitForRequest((r) => r.url().endsWith('/v1/notifications') && r.method() === 'PATCH');
  await telegram.getByRole('button', { name: 'Turn on' }).click();
  const turnOnBody = (await turnOn).postDataJSON();
  assert.deepEqual(turnOnBody.telegram, { enabled: true, token: '', chat_id: '-1001234567890' });
  await telegram.getByRole('button', { name: 'Edit' }).click();
  assert.equal(await telegram.locator('[name=chat_id]').inputValue(), '-1001234567890');
  assert.equal(await telegram.locator('[name=telegram_token]').inputValue(), '');
  await telegram.locator('[name=chat_id]').fill('@teamchannel');
  assert.equal(await telegram.getByRole('button', { name: 'Send test' }).isDisabled(), true);
  const saveResponse = page.waitForResponse((r) => r.url().endsWith('/v1/notifications') && r.request().method() === 'PATCH');
  await telegram.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saveResponse;
  const saved = await response.json();
  assert.equal(saved.notifications.telegram.configured, true, 'blank token retains saved credential');
  assert.ok(!JSON.stringify(saved).includes(TOKEN));
  await telegram.getByText('Saved. Send a test to check it.').waitFor();

  let testBody;
  await page.route('**/v1/notifications/test', async (route) => {
    testBody = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await telegram.getByRole('button', { name: 'Send test' }).click();
  await telegram.getByText('Test sent. Check Telegram.').waitFor();
  assert.deepEqual(testBody, { provider: 'telegram' });
  await page.unroute('**/v1/notifications/test');
  await page.route('**/v1/notifications/test', (route) => route.fulfill({ status: 502, json: { error: 'Test could not be delivered. Check the token, destination, and bot permissions, then try again.' } }));
  await telegram.getByRole('button', { name: 'Send test' }).click();
  await telegram.getByText('Test could not be delivered.', { exact: false }).waitFor();
  assert.equal(await telegram.getByRole('button', { name: 'Send test' }).isEnabled(), true);

  await cliq.getByRole('button', { name: 'Set up' }).click();
  await cliq.locator('[name=cliq_token]').fill('cliq-test-token');
  await cliq.locator('[name=endpoint]').fill('https://example.com/webhook');
  await cliq.getByRole('button', { name: 'Save', exact: true }).click();
  await cliq.getByText('Use a Zoho Cliq bot or channel message endpoint, without a query string.').waitFor();
  await cliq.locator('[name=endpoint]').fill('https://cliq.zoho.in/api/v2/channelsbyname/team/message');
  await cliq.getByRole('button', { name: 'Save', exact: true }).click();
  await cliq.getByText('Saved. Send a test to check it.').waitFor();
  await page.unroute('**/v1/notifications/test');
  await page.route('**/v1/notifications/test', (route) => {
    testBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await cliq.getByRole('button', { name: 'Send test' }).click();
  await cliq.getByText('Test sent. Check Zoho Cliq.').waitFor();
  assert.deepEqual(testBody, { provider: 'cliq' });
  await cliq.getByRole('button', { name: 'Close' }).click();
  await telegram.getByRole('button', { name: 'Close' }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: SHOTS + 'notifications-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile has no horizontal overflow');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: SHOTS + 'notifications-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // A paused destination keeps its credential so it can be resumed without re-entry.
  await telegram.getByLabel('Telegram alerts on').uncheck();
  await page.getByText('Telegram alerts are paused.').waitFor();
  assert.equal(await pill(telegram).textContent(), 'Paused');
  assert.equal(await telegram.getByRole('button', { name: 'Send test' }).isDisabled(), true);
  await cliq.getByRole('button', { name: 'Edit' }).click();
  await cliq.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByText('Zoho Cliq disconnected.').waitFor();
  assert.equal(await pill(cliq).textContent(), 'Not set up');
  await telegram.getByRole('button', { name: 'Edit' }).click();
  await telegram.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByText('Telegram disconnected.').waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'What to send' }).waitFor();
  assert.equal(await pill(telegram).textContent(), 'Not set up');
  assert.equal(await pill(cliq).textContent(), 'Not set up');
  assert.equal(await telegram.getByLabel('Telegram alerts on').count(), 0, 'no switch for what is not set up');

  let fail = true;
  await page.route('**/v1/notifications', async (route) => {
    if (fail && route.request().method() === 'GET') return route.fulfill({ status: 500, json: { error: 'Settings temporarily unavailable' } });
    await route.continue();
  });
  await page.reload();
  await page.getByText('Settings temporarily unavailable').waitFor();
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('heading', { name: 'What to send' }).waitFor();
  assert.deepEqual(errors, []);

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signIn(member, MEMBER);
  await member.getByRole('link', { name: 'Notifications', exact: true }).click();
  await member.getByText('Owners choose where alerts go.').waitFor();
  assert.equal(await member.getByRole('button', { name: 'Set up' }).count(), 0);
  await memberContext.close();
  await context.close();
  console.log('Notification UI: modules, auto-saved events, setup, pause, disconnect, retry, member view and mobile layout passed.');
} finally { await browser.close(); }
