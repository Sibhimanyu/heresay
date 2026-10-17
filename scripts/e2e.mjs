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
  // npm says a newer create-heresay is out, so the owner should be told once.
  await dash.route('https://registry.npmjs.org/create-heresay/latest', (r) => r.fulfill({ json: { version: '9.9.9' } }));
  await signInByLink(dash, OWNER);
  await dash.getByRole('heading', { name: 'Add your first app' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-0-empty.png` });

  step('a newer Heresay on npm: the owner sees how to update, and can put it off until the next one');
  await dash.getByText('Heresay 9.9.9 is out.').waitFor();
  await dash.locator('#update code', { hasText: 'npx create-heresay update' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-0b-update.png` });
  await dash.getByRole('button', { name: 'Dismiss until the next version' }).click();
  assert.equal(await dash.locator('#update').isHidden(), true);
  await dash.reload();
  await dash.getByRole('heading', { name: 'Add your first app' }).waitFor();
  assert.equal(await dash.locator('#update').isHidden(), true, 'stays dismissed for this version');

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
  await dash.goto(`${BASE}/app/#/apps`);
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
  // Hold the send a moment so the Send button's Glance loader can be seen.
  const hold = async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); };
  await app.route('**/reports', hold);
  await sdk.getByRole('button', { name: 'Send' }).click();
  await sdk.locator('.send.busy .glance').waitFor();
  await app.screenshot({ path: `${SHOTS}e2e-2g-sending.png` });
  await sdk.getByText('Waiting for the developer').waitFor();
  await app.unroute('**/reports', hold);

  step('developer sees it with screen and version, declines with a reason');
  await dash.goto(`${BASE}/app/#/apps`);
  // A slow inbox shows the one Glance loader and none of the half-built page, then all of it at once.
  const slow = async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); };
  await dash.route('**/reports', slow);
  await dash.locator('.app-card', { hasText: 'Acme Notes' }).click();
  await dash.locator('#loader.on').waitFor();
  await dash.waitForTimeout(700);
  assert.equal(await dash.locator('#view h1').isVisible(), false, 'the header waits for the reports');
  assert.equal(await dash.locator('.app-loader img').count(), 1, 'one loader, never a second');
  await dash.screenshot({ path: `${SHOTS}e2e-3a-inbox-loading.png` });
  await dash.unroute('**/reports', slow);
  await dash.locator('.status-tabs button', { hasText: 'Open' }).click();
  await dash.locator('#loader:not(.on)').waitFor({ state: 'attached' });
  assert.equal(await dash.locator('#view h1').isVisible(), true, 'the page arrives in one go');
  // A cold refresh on the inbox: the same loader, in the same place, from first paint to the full page.
  await dash.route('**/reports', slow);
  await dash.reload();
  const seen = [];
  for (let i = 0; i < 40 && !(await dash.locator('article.report').first().isVisible()); i++) {
    seen.push(await dash.evaluate(() => {
      const l = document.querySelector('#loader');
      const box = l.getBoundingClientRect();
      const app = document.querySelector('#app');
      return { loaders: document.querySelectorAll('img[src="/loader.svg"]').length, top: Math.round(box.top),
        on: getComputedStyle(l).visibility === 'visible', app: !app.hidden && getComputedStyle(app).visibility === 'visible'
          && getComputedStyle(document.querySelector('#view')).visibility === 'visible' };
    }));
    if (i === 10) await dash.screenshot({ path: `${SHOTS}e2e-3c-cold-load.png` });
    await dash.waitForTimeout(100);
  }
  await dash.unroute('**/reports', slow);
  assert.ok(seen.every((x) => x.loaders === 1), 'one loader the whole way');
  assert.equal(new Set(seen.map((x) => x.top)).size, 1, 'the loader never moves');
  assert.ok(seen.every((x) => !x.app), 'nothing of the page shows until it is all there');
  await dash.locator('#view h1').waitFor();
  const row = dash.locator('article.report').first();
  await row.waitFor();
  await row.getByText('View all details', { exact: true }).click();
  const ctxText = await row.textContent();
  console.log('context shown:', ctxText);
  assert.match(ctxText, /\/demo\.html#\/settings\/billing/);
  assert.match(ctxText, /0\.0\.1-demo/);
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
  // The click is answered where it happened, and the card says what it did before it leaves.
  await row.locator('.done-line', { hasText: 'Declined' }).waitFor();
  await dash.locator('.toast.on', { hasText: 'Declined' }).waitFor();
  await dash.locator('.status-tabs button', { hasText: 'Declined 1' }).waitFor();
  await dash.waitForTimeout(400);  // let the card finish fading into its new state
  await dash.screenshot({ path: `${SHOTS}e2e-3b-dashboard-just-declined.png` });
  await dash.locator('.toast').getByRole('button', { name: 'View declined' }).click();
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
  await dash.locator('.status-tabs button', { hasText: 'Open' }).click();
  await dash.locator('.report-preview', { hasText: 'Dark mode for the calendar' }).click();
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
  await iw.getByText('Help make this app better').waitFor();
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

  step('every view says Powered by Heresay, and it can\'t be switched off');
  const by = await ctx.newPage();
  await by.goto(`${BASE}/demo.html?key=${key}&preview&button=always&preferences=hide`);
  await by.waitForFunction(() => window.Heresay && window.Heresay.open);
  const bw = by.locator('[data-feedback-sdk]');
  await by.evaluate(() => window.Heresay.open());
  await bw.getByText('Sent to this app’s team').waitFor();
  assert.equal(await bw.getByRole('link', { name: 'Powered by Heresay' }).getAttribute('href'), 'https://sibhimanyu.github.io/heresay/');
  assert.equal(await bw.getByRole('tab', { name: 'Preferences' }).count(), 0, 'data-preferences="hide"');
  await bw.getByRole('tab', { name: 'Your reports' }).click();
  await bw.getByRole('link', { name: 'Powered by Heresay' }).waitFor();
  await by.close();

  step('design options: side, words, language, types, theme, all from the tag');
  const des = await ctx.newPage();
  await des.setViewportSize({ width: 1100, height: 720 });
  await des.goto(`${BASE}/demo.html?key=${key}&preview&position=top-left&label=Feedback&lang=fr&types=broken,confusing&theme=dark&accent=%237c3aed&panel=sheet&thanks=Merci%20!`);
  await des.waitForFunction(() => window.Heresay && window.Heresay.open);
  const dw = des.locator('[data-feedback-sdk]');
  const dfab = dw.getByRole('button', { name: 'Signaler un problème' });
  assert.equal((await dfab.textContent()).trim(), 'Feedback');
  const box = await dfab.boundingBox();
  assert.ok(box.x < 100 && box.y < 100, 'top left');
  await des.screenshot({ path: `${SHOTS}e2e-2e-design-button.png` });
  await dfab.click();
  await dw.getByRole('tab', { name: 'Vos signalements' }).waitFor();
  assert.equal(await dw.locator('.type').count(), 2, 'only the types the developer offers');
  assert.equal(await dw.locator('.panel').evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(22, 24, 29)', 'always dark');
  await dw.getByRole('link', { name: 'Propulsé par Heresay' }).waitFor();
  await des.screenshot({ path: `${SHOTS}e2e-2f-design-panel.png` });

  step('open({ type, text }) fills the form in; on("sent") tells the app');
  await des.evaluate(() => { window.__sent = []; window.Heresay.close(); window.Heresay.on('sent', (r) => window.__sent.push(r)); });
  await des.evaluate(() => window.Heresay.open({ type: 'confusing', text: 'Where is export?' }));
  assert.equal(await dw.getByLabel('Que s’est-il passé ?').inputValue(), 'Where is export?');
  assert.equal(await dw.locator('.type[data-type=confusing]').getAttribute('aria-pressed'), 'true');
  await dw.getByRole('button', { name: 'Envoyer' }).click();
  await dw.getByText('Merci !').waitFor();
  assert.deepEqual(await des.evaluate(() => window.__sent), [{ id: 'preview', type: 'confusing' }]);
  await des.close();

  step('no floating button: the app opens it from its own menu, and introduce() has nothing to point at');
  const own = await ctx.newPage();
  await own.goto(`${BASE}/demo.html?key=${key}&preview&button=none`);
  await own.waitForFunction(() => window.Heresay && window.Heresay.open);
  assert.equal(await own.locator('[data-feedback-sdk]').locator('.fab').count(), 0);
  assert.equal(await own.evaluate(() => window.Heresay.introduce()), false);
  await own.evaluate(() => window.Heresay.open());
  await own.locator('[data-feedback-sdk]').getByRole('link', { name: 'Powered by Heresay' }).waitFor();
  await own.close();

  step('the designer: pick options, the preview is the real widget, the tag has only the changes');
  await dash.goto(`${BASE}/app/#/apps/${apps[0].id}/design`);
  await dash.getByRole('heading', { name: 'Design the Report button' }).waitFor();
  await dash.getByText('The recommended setup').waitFor();
  assert.equal(await dash.locator('.code pre').first().textContent(), `<script src="${BASE}/sdk/v1.js" data-key="${key}" defer></script>`);
  await dash.locator('.design-item', { hasText: 'Where it sits' }).getByRole('button', { name: 'Bottom left' }).click();
  await dash.locator('.design-item', { hasText: 'Text' }).getByRole('button', { name: 'Feedback', exact: true }).click();
  await dash.locator('.design-item', { hasText: 'Your colour' }).getByRole('button', { name: 'Purple' }).click();
  await dash.getByText('3 changes from the recommended setup').waitFor();
  const designed = await dash.locator('.code pre').first().textContent();
  assert.match(designed, /data-position="left"/);
  assert.match(designed, /data-label="Feedback"/);
  assert.match(designed, /data-accent="#7c3aed"/);
  assert.doesNotMatch(designed, /data-size|data-theme/, 'defaults stay out of the tag');
  const pf = dash.frameLocator('iframe.design-frame');
  await pf.locator('[data-feedback-sdk]').getByRole('button', { name: 'Report a problem' }).waitFor();
  assert.equal((await pf.locator('[data-feedback-sdk]').getByRole('button', { name: 'Report a problem' }).textContent()).trim(), 'Feedback');
  await dash.getByRole('tab', { name: 'Panel' }).click();
  await pf.locator('[data-feedback-sdk]').getByRole('link', { name: 'Powered by Heresay' }).waitFor();
  await dash.waitForTimeout(300);
  await dash.screenshot({ path: `${SHOTS}e2e-1h-design.png` });
  await dash.getByRole('button', { name: 'Copy prompt for your agent' }).click();
  const designPrompt = await dash.evaluate(() => navigator.clipboard.readText());
  assert.match(designPrompt, /data-position="left"/);
  assert.match(designPrompt, /guide customize-web/);

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

  step('the designer for iOS: HeresayStyle choices, a likeness of the sheet, and the Swift to paste');
  const iosId = /#\/apps\/([^/]+)\/setup/.exec(dash.url())[1];
  await dash.goto(`${BASE}/app/#/apps/${iosId}/design`);
  await dash.getByRole('heading', { name: 'Design the Report button' }).waitFor();
  await dash.getByText('The recommended setup').waitFor();
  assert.doesNotMatch(await dash.locator('.code pre').first().textContent(), /style:/, 'defaults stay out of the code');
  await dash.locator('.design-item', { hasText: 'Where the button sits' }).getByRole('button', { name: 'Bottom left' }).click();
  await dash.locator('.design-item', { hasText: 'Button colour' }).getByRole('button', { name: 'System background' }).click();
  await dash.locator('.design-item', { hasText: 'Your colour' }).getByRole('button', { name: 'Purple' }).click();
  await dash.locator('.design-item', { hasText: 'Language' }).getByRole('button', { name: 'தமிழ்' }).click();
  await dash.locator('.design-item', { hasText: 'Report types' }).getByRole('button', { name: 'Only Broken and Confusing' }).click();
  await dash.locator('.design-item', { hasText: 'Hide it on these screens' }).getByRole('textbox').fill('Checkout, Sign in');
  await dash.getByText('6 changes from the recommended setup').waitFor();
  const swiftStyle = await dash.locator('.code pre').first().textContent();
  assert.match(swiftStyle, /accent: Color\(red: 0\.486, green: 0\.227, blue: 0\.929\)/);
  assert.match(swiftStyle, /style: HeresayStyle\(\n        position: \.bottomLeading,\n        fill: \.neutral,\n        hiddenOnScreens: \["Checkout", "Sign in"\],\n        language: "ta",\n        types: \[\.broken, \.confusing\]\n    \)/, 'in HeresayStyle.init order');
  assert.match(await dash.locator('.code pre').nth(1).textContent(), /heresayReportButton\(\)/);
  await dash.locator('.apple-frame').getByText('தெரிவி').waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-1i-design-ios.png` });
  await dash.getByRole('tab', { name: 'Sheet' }).click();
  await dash.locator('.apple-frame').getByText('Heresay மூலம் இயங்குகிறது').waitFor();
  assert.equal(await dash.locator('.apple-frame .am-type').count(), 2);
  await dash.screenshot({ path: `${SHOTS}e2e-1j-design-ios-sheet.png` });
  await dash.getByRole('tab', { name: 'Introduction' }).click();
  await dash.locator('.apple-frame .am-intro:not(.mac)').waitFor();
  await dash.locator('.apple-frame .am-intro').screenshot({ path: `${SHOTS}e2e-1j-design-ios-intro.png` });
  await dash.getByRole('button', { name: 'Copy prompt for your agent' }).click();
  const iosPrompt = await dash.evaluate(() => navigator.clipboard.readText());
  assert.match(iosPrompt, /guide customize-apple/);
  assert.match(iosPrompt, /Heresay\.setScreen/);

  step('the designer for macOS: the Help menu by default, and a wide sheet on request');
  await dash.goto(`${BASE}/app/#/new/macos`);
  await dash.fill('input[name=name]', 'Acme Mac');
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  const macId = /#\/apps\/([^/]+)\/setup/.exec(dash.url())[1];
  await dash.goto(`${BASE}/app/#/apps/${macId}/design`);
  await dash.locator('.apple-frame').getByText('Report a Problem…').waitFor();
  assert.match(await dash.locator('.code pre').nth(1).textContent(), /\.heresay\(\)\n\}\n\.commands \{ HeresayCommands\(\) \}/);
  await dash.locator('.design-item', { hasText: 'Size' }).last().getByRole('button', { name: 'Wide' }).click();
  await dash.getByRole('tab', { name: 'Sheet' }).click();
  await dash.locator('.apple-frame .am-sheet.mac.large').waitFor();
  assert.match(await dash.locator('.code pre').first().textContent(), /sheet: \.large/);
  await dash.screenshot({ path: `${SHOTS}e2e-1k-design-mac.png` });
  await dash.getByRole('tab', { name: 'Introduction' }).click();
  await dash.locator('.apple-frame .am-intro.mac').getByText('Help make this app better').waitFor();
  await dash.locator('.apple-frame').screenshot({ path: `${SHOTS}e2e-1k-design-mac-intro.png` });

  step('one product on two platforms: add iOS to Acme Notes; one card, one inbox, each report marked');
  await dash.goto(`${BASE}/app/#/apps`);
  await dash.locator('.app-card', { hasText: 'Acme Notes' }).click();
  await dash.getByRole('heading', { name: 'Acme Notes' }).waitFor();
  await dash.getByText('Manage app', { exact: true }).click();
  await dash.getByRole('link', { name: '+ Add a platform' }).click();
  await dash.getByRole('heading', { name: 'Add a platform to Acme Notes' }).waitFor();
  assert.equal(await dash.locator('.platform.added', { hasText: 'Web' }).count(), 1, 'the platform it already has is marked');
  await dash.locator('a.platform', { hasText: 'iOS' }).click();
  assert.equal(await dash.inputValue('input[name=name]'), 'Acme Notes', 'the product name carries over');
  await dash.getByRole('button', { name: 'Create app' }).click();
  await dash.getByText('Checking automatically…').waitFor();
  const all = (await (await api('GET', '/projects')).json()).projects;
  const webApp = all.find((x) => x.name === 'Acme Notes' && x.platform === 'web');
  const iosApp = all.find((x) => x.name === 'Acme Notes' && x.platform === 'ios');
  assert.equal(iosApp.product_id, webApp.id, 'joined the web app\'s product');
  assert.notEqual(iosApp.key, webApp.key);
  await fetch(`${BASE}/v1/reports`, { method: 'POST', headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ key: iosApp.key, device_id: 'ios_device_000000000001', sdk: 'ios', type: 'broken', text: 'The iPhone share sheet is empty', context: { platform: 'ios', route: 'Share' } }) });
  await dash.goto(`${BASE}/app/#/apps`);
  const product = dash.locator('.product-card', { hasText: 'Acme Notes' });
  await product.locator('.platform-line', { hasText: 'Web' }).waitFor();
  await product.locator('.platform-line', { hasText: 'iOS' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-5a-product-card.png`, fullPage: true });
  await product.locator('.platform-line', { hasText: 'Web' }).click();
  await dash.getByRole('heading', { name: 'Acme Notes' }).waitFor();
  await dash.getByLabel('Platform', { exact: true }).waitFor();
  await dash.locator('.status-tabs button', { hasText: 'All' }).last().click();
  await dash.locator('.report-preview', { hasText: 'The iPhone share sheet is empty' }).click();
  const iosRow = dash.locator('article.report', { hasText: 'The iPhone share sheet is empty' });
  await iosRow.locator('.platform-pill', { hasText: 'iOS' }).waitFor();
  await dash.locator('.report-preview', { hasText: 'Web' }).first().waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-5b-product-inbox.png`, fullPage: true });
  await dash.getByLabel('Platform', { exact: true }).selectOption('ios');
  assert.equal(await dash.locator('article.report .platform-pill', { hasText: 'Web' }).count(), 0, 'the platform filter narrows it');
  await iosRow.getByRole('button', { name: 'Accept' }).click();
  await iosRow.locator('.done-line', { hasText: 'Accepted' }).waitFor();
  await dash.locator('.status-tabs button', { hasText: 'Accepted 1' }).waitFor();

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
  await dash.reload();
  await dash.getByText('Manage app', { exact: true }).click();
  await dash.getByText(/Agents fix these in github.com\/acme\/notes/).waitFor();

  step('the trail: pages, clicks, failed requests and errors go with a report; the reporter can leave parts out');
  const ctx3 = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const host = await ctx3.newPage();
  await host.goto(`${BASE}/demo.html?key=${key}#/home`);
  const hsdk = host.locator('[data-feedback-sdk]');
  await hsdk.getByRole('button', { name: /Report a problem/ }).waitFor();
  // The stand-in app does what a real one would: moves between screens, has buttons, calls its API.
  await host.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'Save changes';
    b.onclick = async () => {
      await fetch('/api/profile?session=s3cr3t', { method: 'PATCH' }).catch(() => {});
      console.error(new TypeError('user.avatar is undefined'));
    };
    const pw = document.createElement('button');
    pw.textContent = 'Email asha@example.org';
    pw.dataset.heresayPrivate = '';
    document.querySelector('main').append(b, pw);
    history.pushState({}, '', '/demo.html' + location.search + '#/settings');
  });
  await host.getByRole('button', { name: 'Email asha@example.org' }).click();
  await host.getByRole('button', { name: 'Save changes' }).click();
  await host.waitForTimeout(500);
  await hsdk.getByRole('button', { name: /Report a problem/ }).click();
  await hsdk.getByRole('button', { name: /Broken/ }).click();
  await hsdk.getByLabel('What happened?').fill('Saving my profile does nothing.');
  await hsdk.getByRole('switch', { name: 'Attach what happened' }).waitFor();
  assert.equal(await hsdk.getByRole('switch', { name: 'Attach what happened' }).isChecked(), true, 'on by default');
  for (const chip of ['2 pages', '2 clicks', '1 failed request', '1 error']) await hsdk.getByRole('button', { name: chip }).waitFor();
  await hsdk.getByText('See it').click();
  const lines = await hsdk.locator('.tlist li').allTextContents();
  console.log('trail on the device:', lines);
  assert.ok(lines.some((l) => /PATCH \/api\/profile → 404/.test(l)), 'the failed request, without its query string');
  assert.ok(lines.some((l) => /TypeError: user\.avatar is undefined/.test(l)));
  assert.ok(lines.some((l) => /button "Save changes"/.test(l)));
  assert.ok(lines.every((l) => !/s3cr3t|asha@/.test(l)), 'no query strings, private text stays out');
  await host.screenshot({ path: `${SHOTS}e2e-8a-trail-form.png` });
  await hsdk.getByRole('button', { name: '2 clicks' }).click();
  assert.equal(await hsdk.getByRole('button', { name: '2 clicks' }).getAttribute('aria-pressed'), 'false');
  await host.screenshot({ path: `${SHOTS}e2e-8b-trail-without-clicks.png` });
  await hsdk.getByRole('button', { name: 'Send' }).click();
  await hsdk.getByText('Waiting for the developer').waitFor();
  await ctx3.close();

  const listed = (await (await api('GET', `/projects/${project.id}/reports`)).json()).reports;
  const withTrail = listed.find((r) => r.text === 'Saving my profile does nothing.');
  console.log('trail stored:', withTrail.trail.map((e) => `${e.kind}: ${e.text}`));
  assert.deepEqual([...new Set(withTrail.trail.map((e) => e.kind))].sort(), ['error', 'page', 'request']);
  assert.match(withTrail.trail.find((e) => e.kind === 'error').detail ?? '', /at /, 'the top of the stack');
  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.reload();
  await dash.locator('.status-tabs button', { hasText: 'Open' }).click();
  await dash.locator('.report-preview', { hasText: 'Saving my profile does nothing.' }).click();
  const tcard = dash.locator('article.report', { hasText: 'Saving my profile does nothing.' });
  await tcard.locator('details.trail[open]').waitFor();
  await tcard.locator('.trail li.k-request', { hasText: 'PATCH /api/profile → 404' }).waitFor();
  await tcard.getByText('View all details', { exact: true }).click();
  await tcard.locator('.device-grid dd', { hasText: 'desktop, mouse' }).waitFor();
  await tcard.locator('.device-grid dd', { hasText: /\d+x\d+@\d/ }).waitFor();
  await tcard.screenshot({ path: `${SHOTS}e2e-8c-trail-dashboard.png` });
  assert.equal((await api('POST', `/projects/${project.id}/reports/${withTrail.id}/accept`)).status, 200);
  const tprompt = (await (await api('GET', `/projects/${project.id}/reports/${withTrail.id}/prompt`)).json()).prompt;
  assert.match(tprompt, /Request: PATCH \/api\/profile → 404/);
  assert.match(tprompt, /- Device: desktop, mouse/);
  assert.match(tprompt, /Last thing that went wrong, \d+ s before they sent it: TypeError: user\.avatar is undefined/);
  assert.ok(tprompt.indexOf('Request: PATCH') < tprompt.lastIndexOf('\"\"\"'), 'inside the fence');

  step('offering help: a button that does nothing, pressed again and again, brings a note that opens the form');
  const ctx4 = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const stuck = await ctx4.newPage();
  await stuck.goto(`${BASE}/demo.html?key=${key}&nudge=on`);
  const ssdk = stuck.locator('[data-feedback-sdk]');
  await ssdk.getByRole('button', { name: /Report a problem/ }).waitFor();
  await stuck.evaluate(() => {
    const b = document.createElement('button');
    b.textContent = 'Place order';
    document.querySelector('main').append(b);
  });
  for (let i = 0; i < 3; i++) await stuck.getByRole('button', { name: 'Place order' }).click();
  const offer = ssdk.getByRole('status', { name: 'Offer to report a problem' });
  await offer.getByText('Something not working?').waitFor({ timeout: 5000 });
  await stuck.waitForTimeout(400); // past the fade-in
  await stuck.screenshot({ path: `${SHOTS}e2e-9a-nudge.png` });
  await offer.getByRole('button', { name: 'Tell the team' }).click();
  assert.equal(await ssdk.getByRole('button', { name: /Broken/ }).getAttribute('aria-pressed'), 'true', 'opens as Broken');
  await ssdk.getByLabel('What happened?').fill('Place order does nothing.');
  await ssdk.getByRole('button', { name: '3 clicks' }).waitFor();
  await ssdk.getByRole('button', { name: 'Send' }).click();
  await ssdk.getByText('Waiting for the developer').waitFor();
  await ctx4.close();
  const nudged = (await (await api('GET', `/projects/${project.id}/reports`)).json()).reports
    .find((r) => r.text === 'Place order does nothing.');
  assert.ok(nudged.trail.some((e) => e.kind === 'click' && e.text === 'button "Place order"' && e.n === 3), 'the clicks went with it');

  step('offering help, unsure: the same few pages over and over brings "Stuck on something?", opening as Confusing');
  const ctx5 = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const lost = await ctx5.newPage();
  await lost.goto(`${BASE}/demo.html?key=${key}&nudge=circles`);
  const lsdk = lost.locator('[data-feedback-sdk]');
  await lsdk.getByRole('button', { name: /Report a problem/ }).waitFor();
  // Like Firestore, the app POSTs by itself on every page change. That is not the person sending
  // something, so it must not start the count over.
  await lost.route('**/listen-channel', (r) => r.fulfill({ status: 200, body: '{}' }));
  for (const h of ['#/plans', '#/faq', '#/plans', '#/faq', '#/plans']) {
    await lost.evaluate((x) => { location.hash = x; return fetch('/listen-channel', { method: 'POST', body: '{}' }); }, h);
  }
  const unsure = lsdk.getByRole('status', { name: 'Offer to report a problem' });
  await unsure.getByText('Stuck on something?').waitFor({ timeout: 5000 });
  await lost.waitForTimeout(400); // past the fade-in
  await lost.screenshot({ path: `${SHOTS}e2e-9b-nudge-stuck.png` });
  await unsure.getByRole('button', { name: 'Tell the team' }).click();
  assert.equal(await lsdk.getByRole('button', { name: /Confusing/ }).getAttribute('aria-pressed'), 'true', 'opens as Confusing');
  await ctx5.close();

  step('ChatGPT: a team member connects it with their own sign-in, and sends an idea with the conversation\'s context');
  // Played the way ChatGPT does it: discovery, registration, the member says yes on the dashboard, PKCE.
  const unauth = await fetch(`${BASE}/v1/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } }) });
  assert.equal(unauth.status, 401);
  const metaUrl = /resource_metadata="([^"]+)"/.exec(unauth.headers.get('www-authenticate'))[1];
  const prm = await (await fetch(metaUrl)).json();
  assert.equal(prm.resource, `${BASE}/v1/mcp`);
  const asMeta = await (await fetch(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
  const cb = createServer((q, s) => { s.end('back in the chat app'); });
  await new Promise((ok) => cb.listen(0, '127.0.0.1', ok));
  const redirect = `http://127.0.0.1:${cb.address().port}/cb`;
  const client = await (await fetch(asMeta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'ChatGPT', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })).json();
  const { createHash, randomBytes } = await import('node:crypto');
  const verifier = randomBytes(32).toString('base64url');
  const authUrl = new URL(asMeta.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, state: 'e2e-state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', scope: 'heresay.requests' })) authUrl.searchParams.set(k, v);
  await dash.goto(authUrl.href);
  await dash.getByRole('heading', { name: 'Connect ChatGPT to Heresay?' }).waitFor();
  await dash.getByText(`As ${OWNER}. It will be able to:`).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-10a-chat-authorize.png` });
  await dash.getByRole('button', { name: 'Connect' }).click();
  await dash.waitForURL(/\/cb\?/);
  const back = new URL(dash.url());
  assert.equal(back.searchParams.get('state'), 'e2e-state');
  cb.close();
  const tokens = await (await fetch(asMeta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier }) })).json();
  assert.ok(tokens.access_token && tokens.refresh_token, JSON.stringify(tokens));

  // The official MCP client, over Streamable HTTP, as a chat app talks to it.
  const PKG = new URL('../packages/heresay/', import.meta.url).pathname;
  const { Client } = await import(`${PKG}node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js`);
  const { StreamableHTTPClientTransport } = await import(`${PKG}node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js`);
  const chat = new Client({ name: 'chatgpt-e2e', version: '1' });
  await chat.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/v1/mcp`), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }));
  assert.deepEqual((await chat.listTools()).tools.map((t) => t.name), ['list_apps', 'draft_request', 'send_draft', 'withdraw_request', 'my_requests']);
  const chatApps = (await chat.callTool({ name: 'list_apps', arguments: {} })).structuredContent.apps;
  assert.ok(chatApps.some((a) => a.name === 'Acme Notes'));
  // Nothing is sent until a second step: the person sees which app it's for first.
  const draft = await chat.callTool({ name: 'draft_request', arguments: { app: 'Acme Notes', type: 'idea',
    text: 'Let people pin a note to the top of the list.',
    details: 'Came up while planning the Q4 roadmap. They keep a few notes open all week. Considered favourites: ruled out, it hides the order.' } });
  assert.equal(draft.structuredContent.sent, false);
  assert.match(draft.content[0].text, /^Draft, not sent yet\. App: Acme Notes/);
  const sent = await chat.callTool({ name: 'send_draft', arguments: { draft_id: draft.structuredContent.draft_id } });
  assert.equal(sent.structuredContent.status, 'open');
  const mineNow = (await chat.callTool({ name: 'my_requests', arguments: {} })).structuredContent.requests;
  assert.deepEqual(mineNow.map((r) => r.status), ['open']);
  await chat.close();

  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.reload();
  await dash.locator('.report-preview', { hasText: 'Let people pin a note to the top of the list.' }).click();
  const chatCard = dash.locator('article.report', { hasText: 'Let people pin a note to the top of the list.' });
  await chatCard.getByText('From ChatGPT').waitFor();
  await chatCard.getByText(`From the team: ${OWNER}, in a conversation in ChatGPT`).waitFor();
  await chatCard.getByText(/Considered favourites: ruled out/).waitFor();
  await chatCard.screenshot({ path: `${SHOTS}e2e-10b-chat-report.png` });
  // Like any report: an agent sees it only once a person accepts it, with the context fenced.
  const chatReport = (await (await api('GET', `/projects/${project.id}/reports`)).json()).reports.find((r) => r.text === 'Let people pin a note to the top of the list.');
  assert.equal((await api('GET', `/projects/${project.id}/reports/${chatReport.id}/prompt`)).status, 404);
  assert.equal((await api('POST', `/projects/${project.id}/reports/${chatReport.id}/accept`)).status, 200);
  const chatPrompt = (await (await api('GET', `/projects/${project.id}/reports/${chatReport.id}/prompt`)).json()).prompt;
  assert.match(chatPrompt, /sent this from a conversation in ChatGPT/);
  assert.ok(chatPrompt.indexOf('ruled out') < chatPrompt.lastIndexOf('"""'));

  await dash.goto(`${BASE}/app/#/chat`);
  await dash.getByRole('heading', { name: 'Chat apps', exact: true }).waitFor();
  await dash.getByRole('tab', { name: 'Claude' }).click();
  await dash.getByText('Add custom connector', { exact: false }).first().waitFor();
  await dash.getByRole('tab', { name: 'Perplexity' }).click();
  await dash.getByText(/Streamable HTTP/).first().waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-10f-chat-apps-perplexity.png`, fullPage: true });
  await dash.locator('.members li', { hasText: 'ChatGPT' }).waitFor();
  await dash.screenshot({ path: `${SHOTS}e2e-10c-chat-apps.png`, fullPage: true });
  await dash.locator('.members li', { hasText: 'ChatGPT' }).getByRole('button', { name: 'Disconnect' }).click();
  await dash.getByText('None yet.').waitFor();
  const after = await fetch(`${BASE}/v1/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.access_token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) });
  assert.equal(after.status, 401, 'disconnected: the chat app stops at once');

  // A workspace that blocks MCP plugins: a chat token for a ChatGPT Sites bridge instead.
  await dash.getByRole('button', { name: 'Create chat token' }).click();
  const chatToken = await dash.locator('code.token-out').textContent();
  assert.match(chatToken, /^hct_/);
  await dash.screenshot({ path: `${SHOTS}e2e-10d-chat-token.png`, fullPage: true });
  const viaTokenCall = async (name, args) => (await (await fetch(`${BASE}/v1/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${chatToken}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  const tokenDraft = await viaTokenCall('draft_request', { app: 'Acme Notes', type: 'improvement', text: 'Sent through a bridge with a chat token.' });
  assert.equal((await viaTokenCall('send_draft', { draft_id: tokenDraft.structuredContent.draft_id })).structuredContent.status, 'open');

  // Markdown from a chat app is shown formatted, and stays inert: no HTML, no script links.
  const mdDraft = await viaTokenCall('draft_request', { app: 'Acme Notes', type: 'idea',
    text: 'Pin notes with a **keyboard shortcut**, see [the spec](https://example.com/spec) or https://example.com/notes.',
    details: '## Why\n\n- reaching for the mouse breaks flow\n- `Cmd+K` was the favourite\n\n> keep it discoverable\n\n<img src=x onerror="window.__pwned=1">\n\n[click me](javascript:window.__pwned=2)',
    document: '# Pinning spec\n\n| Key | Action |\n| --- | --- |\n| Cmd+K | Pin |\n\n```js\nconst pinned = true;\n```\n\n1. First\n2. Second\n   - nested',
    document_title: 'Pinning spec' });
  await viaTokenCall('send_draft', { draft_id: mdDraft.structuredContent.draft_id });
  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.reload();
  await dash.locator('.report-preview', { hasText: 'Pin notes with a' }).click();
  const mdCard = dash.locator('article.report', { hasText: 'Pin notes with a' });
  await mdCard.locator('.md strong', { hasText: 'keyboard shortcut' }).waitFor();
  assert.equal(await mdCard.locator('.md a[href="https://example.com/spec"]').count(), 1);
  assert.equal(await mdCard.locator('.md a[href="https://example.com/notes"]', { hasText: 'https://example.com/notes' }).count(), 1, 'a bare address is a link');
  assert.equal(await mdCard.locator('.chat-details:not(.chat-doc) .md h4', { hasText: 'Why' }).count(), 1, '## becomes a small heading');
  assert.equal(await mdCard.locator('.chat-details:not(.chat-doc) .md li').count(), 2);
  assert.equal(await mdCard.locator('.chat-details:not(.chat-doc) .md code', { hasText: 'Cmd+K' }).count(), 1);
  assert.equal(await mdCard.locator('img').count(), 0, 'HTML stays text');
  assert.equal(await mdCard.locator('a[href^="javascript"]').count(), 0, 'no script links');
  assert.equal(await dash.evaluate(() => window.__pwned), undefined);
  await mdCard.locator('summary', { hasText: 'Attached document: Pinning spec' }).click();
  await mdCard.locator('.chat-doc table td', { hasText: 'Cmd+K' }).waitFor();
  assert.equal(await mdCard.locator('.chat-doc pre.md-code', { hasText: 'const pinned = true;' }).count(), 1);
  assert.equal(await mdCard.locator('.chat-doc ol > li > ul > li', { hasText: 'nested' }).count(), 1);
  await mdCard.screenshot({ path: `${SHOTS}e2e-10e-chat-markdown.png` });
  await dash.goto(`${BASE}/app/#/chat`);
  await dash.reload();
  await dash.locator('.members li', { hasText: 'Chat token' }).getByRole('button', { name: 'Disconnect' }).click();
  await dash.getByText('None yet.').waitFor();

  step('duplicates: a similar report is suggested, merged into one card, and its reporter hears the outcome');
  const sendAs = (text, dev) => fetch(`${BASE}/v1/reports`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE },
    body: JSON.stringify({ key, device_id: dev, type: 'broken', text, context: { route: '/settings' } }) }).then((x) => x.json());
  const first = (await sendAs('Changing the avatar photo fails with an error', 'e2e_dup_device_00000001')).report;
  const second = (await sendAs('Avatar photo change fails, shows an error', 'e2e_dup_device_00000002')).report;
  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.reload();
  await dash.locator('.report-preview', { hasText: 'Avatar photo change fails, shows an error' }).click();
  const dupCard = dash.locator('article.report', { hasText: 'Avatar photo change fails, shows an error' });
  await dupCard.locator('.suggest', { hasText: 'Changing the avatar photo fails with an error' }).waitFor();
  await dupCard.getByRole('button', { name: 'Merge into it' }).click();
  await dash.locator('.report-preview', { hasText: 'Changing the avatar photo fails with an error' }).click();
  const keep = dash.locator('article.report', { hasText: 'Changing the avatar photo fails with an error' });
  await keep.getByText('2 people reported this').waitFor();
  assert.equal(await dash.locator('article.report', { hasText: 'Avatar photo change fails, shows an error' }).filter({ hasNot: dash.locator('.dups') }).count(), 0, 'the merged one left the list');
  await keep.locator('.dups summary').click();
  await keep.screenshot({ path: `${SHOTS}e2e-11a-duplicates.png` });
  assert.equal((await api('POST', `/projects/${project.id}/reports/${first.id}/decline`, { reason: 'Fixed by the new upload flow in 2.0.' })).status, 200);
  const theirs = await (await fetch(`${BASE}/v1/reports/mine`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE },
    body: JSON.stringify({ key, device_id: 'e2e_dup_device_00000002' }) })).json();
  const heard = theirs.reports.find((x) => x.id === second.id);
  assert.equal(heard.status, 'declined');
  assert.equal(heard.decline_reason, 'Fixed by the new upload flow in 2.0.', 'the merged reporter reads the same reason');

  step('a fix carries its PR and version; the reporter, on an older version, is told to update');
  const fixDevice = 'e2e_fix_device_000000001';
  const toFix = (await sendAs('Printing a note cuts off the last line', fixDevice)).report;
  assert.equal((await api('POST', `/projects/${project.id}/reports/${toFix.id}/accept`)).status, 200);
  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.reload();
  await dash.getByRole('button', { name: /^Accepted/ }).click();
  await dash.locator('.report-preview', { hasText: 'Printing a note cuts off the last line' }).click();
  const fixCard = dash.locator('article.report', { hasText: 'Printing a note cuts off the last line' });
  await fixCard.getByRole('button', { name: 'Mark fixed…' }).click();
  await fixCard.getByLabel('Note for the reporter').fill('Printing keeps every line now.');
  await fixCard.getByLabel('Pull request link').fill('https://github.com/acme/notes/pull/77');
  await fixCard.getByLabel('Ships in version').fill('1.4');
  await fixCard.getByRole('button', { name: 'Mark fixed' }).click();
  await dash.getByRole('button', { name: /^Fixed/ }).click();
  await dash.locator('.report-preview', { hasText: 'Printing a note cuts off the last line' }).click();
  const fixedCard = dash.locator('article.report', { hasText: 'Printing a note cuts off the last line' });
  await fixedCard.getByText('Fixed in 1.4').waitFor();
  await fixedCard.getByRole('link', { name: 'PR #77' }).waitFor();
  await fixedCard.screenshot({ path: `${SHOTS}e2e-12a-fix-ref.png` });
  // The reporter's widget, on 0.0.1-demo: the version, and a nudge to update. Never the PR.
  const fixCtx = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  await fixCtx.addInitScript((d) => localStorage.setItem('fbsdk.device', d), fixDevice);
  const rep = await fixCtx.newPage();
  await rep.goto(`${BASE}/demo.html?key=${key}`);
  const rsdk = rep.locator('[data-feedback-sdk]');
  await rsdk.getByRole('button', { name: /update/ }).click();
  await rsdk.getByText('Fixed in version 1.4. Update to 1.4 to get it.').waitFor();
  assert.equal(await rsdk.getByText('pull/77').count(), 0);
  await rep.screenshot({ path: `${SHOTS}e2e-12b-fixed-in-version.png` });
  await fixCtx.close();

  step('a reporter takes a report back: kept as withdrawn, with when and why, never deleted');
  const wdDevice = 'e2e_withdraw_device_0001';
  const toTake = (await sendAs('Please add a calendar view', wdDevice)).report;
  const wdCtx = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  await wdCtx.addInitScript((d) => localStorage.setItem('fbsdk.device', d), wdDevice);
  const wd = await wdCtx.newPage();
  await wd.goto(`${BASE}/demo.html?key=${key}`);
  const wsdk = wd.locator('[data-feedback-sdk]');
  await wsdk.getByRole('button', { name: /Report a problem/ }).click();
  await wsdk.getByRole('tab', { name: 'Your reports' }).click();
  const item = wsdk.locator('.item', { hasText: 'Please add a calendar view' });
  await item.getByRole('button', { name: 'Take back' }).click();
  await item.getByText('It isn’t deleted').waitFor();
  await item.getByLabel('Why? (optional)').fill('Found it under Views.');
  await item.getByRole('button', { name: 'Take it back' }).click();
  await item.getByText('You took this back').waitFor();
  await item.getByText('Your reason: Found it under Views.').waitFor();
  await wd.screenshot({ path: `${SHOTS}e2e-13a-take-back.png` });
  await wdCtx.close();
  await dash.goto(`${BASE}/app/#/apps/${project.id}`);
  await dash.reload();
  await dash.getByRole('button', { name: /^Withdrawn/ }).click();
  await dash.locator('.report-preview', { hasText: 'Please add a calendar view' }).click();
  const wdCard = dash.locator('article.report', { hasText: 'Please add a calendar view' });
  await wdCard.getByText(/Withdrawn by the person who sent it on .*: Found it under Views\./).waitFor();
  assert.equal(await wdCard.getByRole('button', { name: 'Accept' }).count(), 0, 'nothing to triage');
  await wdCard.screenshot({ path: `${SHOTS}e2e-13b-withdrawn.png` });
  assert.equal(((await (await api('GET', `/projects/${project.id}/reports`)).json()).reports.find((x) => x.id === toTake.id)).status, 'withdrawn');

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
  await outsider.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
  await outsider.locator('.report-preview', { hasText: 'Acme Notes' }).first().waitFor();
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
