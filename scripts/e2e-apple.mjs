// The Apple SDK against the emulators: the Swift package's live test sends a real report from
// macOS and from the iOS simulator, and the team sees both in the dashboard API.
//
// Run with `npm run e2e:apple` (needs Xcode; starts and stops the emulators).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:5055';
const PROJECT = 'demo-feedback-sdk';
const AUTH = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1';
const step = (s) => console.log(`\n== ${s}`);

async function member(email) {
  const at = new Date().toISOString();
  await fetch(`http://127.0.0.1:8181/v1/projects/${PROJECT}/databases/(default)/documents/meta/instance`, {
    method: 'PATCH', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { created_at: { stringValue: at }, members: { arrayValue: { values: [{ mapValue: { fields: {
      email: { stringValue: email }, role: { stringValue: 'owner' }, added_at: { stringValue: at }, added_by: { nullValue: null } } } }] } } } }) });
  await fetch(`${AUTH}/projects/${PROJECT}/accounts`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', emailVerified: true }) });
  const r = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }) })).json();
  return (method, path, body) => fetch(`${BASE}/v1${path}`, { method, headers: { authorization: `Bearer ${r.idToken}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body) }).then((x) => x.json());
}

const person = await member(`apple${Date.now()}@example.com`);
const app = (await person('POST', '/projects', { name: 'Acme iOS', platform: 'ios', framework: 'swiftui', allowed_origins: [] })).project;
assert.equal(app.platform, 'ios');

const cwd = `${ROOT}apple`;
const run = (cmd, args, env) => {
  try { return execFileSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) {
    console.error(e.stdout?.toString().slice(-3000), e.stderr?.toString().slice(-3000));
    throw e;
  }
};

step('macOS: swift test sends a real report');
const mac = run('swift', ['test', '--filter', 'LiveTests'], { HERESAY_TEST_URL: BASE, HERESAY_TEST_KEY: app.key });
assert.match(mac, /Executed 1 test, with 0 failures/);

step('iOS simulator: xcodebuild test sends a real report');
const sim = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j']).toString());
const phone = Object.entries(sim.devices).filter(([rt]) => /iOS/.test(rt)).flatMap(([, ds]) => ds).find((d) => /iPhone/.test(d.name));
assert.ok(phone, 'an iPhone simulator');
const ios = run('xcodebuild', ['test', '-scheme', 'Heresay', '-destination', `platform=iOS Simulator,id=${phone.udid}`, '-only-testing:HeresayTests/LiveTests'],
  { TEST_RUNNER_HERESAY_TEST_URL: BASE, TEST_RUNNER_HERESAY_TEST_KEY: app.key });
assert.match(ios, /TEST SUCCEEDED/);

step('the team sees both, with platform and OS attached');
const { reports } = await person('GET', `/projects/${app.id}/reports`);
const platforms = reports.map((r) => r.context.platform).sort();
console.log(reports.map((r) => `${r.context.platform} · ${r.context.os} · ${r.context.route} · v${r.context.app_version}`).join('\n'));
assert.deepEqual(platforms, ['ios', 'macos']);
assert.ok(reports.every((r) => r.context.route === 'LiveTests' && r.context.app_version === '0.0.1-swift-test'));
assert.ok(reports.some((r) => /^iOS /.test(r.context.os)));

console.log('\nAPPLE E2E PASSED');
