// Updates for a connected repo: what is behind, what the session-start hook says and when, and
// the hook `connect` writes. Against a stand-in Heresay and npm registry, never the real ones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = (p) => mkdtempSync(join(tmpdir(), p));
process.env.HERESAY_HOME = tmp('heresay-home-');
process.env.HERESAY_SWIFT_LATEST = '0.2.22';

let instance = '0.2.20';
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/v1/health') return res.end(JSON.stringify({ ok: true, version: instance }));
  if (req.url === '/create-heresay/latest') return res.end(JSON.stringify({ version: '0.2.22' }));
  if (req.url === '/v1/agent/apps') return res.end(JSON.stringify({ apps: [] }));
  res.statusCode = 404; res.end('{}');
});
let u;
before(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.HERESAY_REGISTRY = base;
  process.env.HERESAY_URL = base;
  process.env.HERESAY_TOKEN = 'hst_test_x';
  u = await import('../src/updates.mjs');
});
after(() => server.close());

const resolved = (version, location = 'https://github.com/Sibhimanyu/heresay-swift') =>
  JSON.stringify({ pins: [{ identity: 'heresay-swift', kind: 'remoteSourceControl', location, state: { version } },
    { identity: 'other', location: 'https://github.com/x/other', state: { version: '0.0.1' } }], version: 2 });

/** A repo connected by an older heresay: skill version 5, no hook, Swift pinned at 0.2.11. */
function oldRepo() {
  const root = tmp('heresay-repo-');
  mkdirSync(join(root, '.claude/skills/heresay'), { recursive: true });
  writeFileSync(join(root, '.claude/skills/heresay/SKILL.md'), '<!-- heresay-skill-version: 5. -->');
  writeFileSync(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { heresay: { command: 'npx', args: ['-y', 'heresay@0', 'mcp'] } } }));
  mkdirSync(join(root, 'Notes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'), { recursive: true });
  writeFileSync(join(root, 'Notes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'), resolved('0.2.11'));
  return root;
}

test('newer compares versions as numbers', () => {
  assert.ok(u.newer('0.2.10', '0.2.9'));
  assert.ok(u.newer('v1.0.0', '0.9.9'));
  assert.ok(!u.newer('0.2.9', '0.2.10'));
  assert.ok(!u.newer('junk', '0.1.0'));
});

test('finds the Swift pin in Xcode bundles and SwiftPM, not in dependencies', () => {
  const root = oldRepo();
  writeFileSync(join(root, 'Package.resolved'), resolved('0.2.20'));
  mkdirSync(join(root, '.build/checkouts/x'), { recursive: true });
  writeFileSync(join(root, '.build/checkouts/x/Package.resolved'), resolved('0.1.0'));
  const pins = u.swiftPins(root).sort((a, b) => a.file.localeCompare(b.file));
  assert.deepEqual(pins.map((p) => [p.file, p.version]), [
    ['Notes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', '0.2.11'],
    ['Package.resolved', '0.2.20'],
  ]);
});

test('lists what is behind: the Heresay, the Swift package, the agent files', async () => {
  const root = oldRepo();
  const { updates, ask_first } = await u.allUpdates(undefined, { root });
  assert.deepEqual(updates.map((x) => x.id), ['instance@0.2.22', 'swift@0.2.22', 'agent-files@7']);
  assert.match(updates[0].how, /npx create-heresay update/);
  assert.match(updates[1].title, /from 0\.2\.11 to 0\.2\.22/);
  assert.match(updates[1].how, /Update to Latest Package Versions/);
  assert.match(updates[2].summary, /skill \(version 5, now 7\).*heresay@0.*session-start/);
  assert.match(ask_first, /Apply nothing without a yes/);
});

test('nothing when everything is current, and a no is kept until a newer version', async () => {
  const root = oldRepo();
  instance = '0.2.22';
  const { writeRepoFiles } = await import('../src/connect.mjs');
  writeRepoFiles(root);
  writeFileSync(join(root, 'Notes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'), resolved('0.2.22'));
  assert.deepEqual((await u.allUpdates(undefined, { root })).updates, []);

  writeFileSync(join(root, 'Notes.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'), resolved('0.2.11'));
  const { skipUpdate } = await import('../src/client.mjs');
  skipUpdate('swift@0.2.22', { root });
  assert.deepEqual((await u.allUpdates(undefined, { root })).updates, [], 'not asked again');
  process.env.HERESAY_SWIFT_LATEST = '0.3.0';
  assert.deepEqual((await u.allUpdates(undefined, { root })).updates.map((x) => x.id), ['swift@0.3.0'], 'a newer one is');
  process.env.HERESAY_SWIFT_LATEST = '0.2.22';
  instance = '0.2.20';
});

test('the session-start hook speaks once, then stays quiet', async () => {
  const root = oldRepo();
  const t0 = Date.parse('2026-10-16T09:00:00Z');
  const first = await u.hookOutput({ root, now: t0 });
  assert.equal(first.hookSpecificOutput.hookEventName, 'SessionStart');
  const said = first.hookSpecificOutput.additionalContext;
  assert.match(said, /\[instance@0\.2\.22\]/);
  assert.match(said, /\[swift@0\.2\.22\]/);
  assert.match(said, /ask whether to apply them/);
  assert.match(said, /Apply nothing without a yes/);
  assert.equal(await u.hookOutput({ root, now: t0 + 60_000 }), null, 'a minute later: not again');
  assert.equal(await u.hookOutput({ root, now: t0 + 2 * 3600_000 }), null, 'two hours later, nothing new: not again');
  assert.ok(await u.hookOutput({ root, now: t0 + 25 * 3600_000 }), 'the next day: once more');
  process.env.HERESAY_SWIFT_LATEST = '0.2.23';
  assert.match((await u.hookOutput({ root, now: t0 + 27 * 3600_000 })).hookSpecificOutput.additionalContext, /swift@0\.2\.23/, 'something new: straight away');
  process.env.HERESAY_SWIFT_LATEST = '0.2.22';
});

test('connect adds the hook once, next to the repo\'s own, and disconnect takes only it out', async () => {
  const root = tmp('heresay-repo-');
  mkdirSync(join(root, '.claude'), { recursive: true });
  const theirs = { matcher: 'startup', hooks: [{ type: 'command', command: 'echo hi' }] };
  writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { SessionStart: [theirs] } }));
  const { writeRepoFiles, removeRepoFiles } = await import('../src/connect.mjs');
  writeRepoFiles(root);
  writeRepoFiles(root);
  const s = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(s.permissions, { allow: ['Bash(ls)'] });
  assert.equal(s.hooks.SessionStart.length, 2, 'theirs and ours, ours once');
  assert.deepEqual(s.hooks.SessionStart[0], theirs);
  assert.equal(s.hooks.SessionStart[1].hooks[0].command, u.HOOK_COMMAND);
  assert.ok(u.hasHook(root));
  removeRepoFiles(root);
  const after = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(after.hooks.SessionStart, [theirs]);

  const only = tmp('heresay-repo-');
  writeRepoFiles(only);
  removeRepoFiles(only);
  assert.ok(!existsSync(join(only, '.claude/settings.json')), 'gone when it held only ours');
});
