// Backup and restore against the Firestore emulator: every document comes back exactly, including
// typed values, subcollections, and documents that exist only as a parent. Rate counters are left out.
// Run: firebase emulators:exec --only firestore 'node --test scripts/backup-roundtrip.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as backup from '../packages/create-heresay/src/backup.mjs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181';
const base = `http://${HOST}/v1`;
const project = 'demo-feedback-sdk';
const call = async (method, url, { body } = {}) => {
  const r = await fetch(url, { method, headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(b)}`);
  return b;
};
const docs = `${base}/projects/${project}/databases/(default)/documents`;
const put = (path, fields) => call('PATCH', `${docs}/${path}`, { body: { fields } });
const wipe = () => fetch(`http://${HOST}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });

test('a backup restores every document exactly, and skips rate counters', async () => {
  await wipe();
  assert.equal(await backup.hasData(call, { base, project }), false, 'empty to start');
  await put('meta/instance', { members: { arrayValue: { values: [{ mapValue: { fields: { email: { stringValue: 'o@example.com' }, role: { stringValue: 'owner' }, added_by: { nullValue: null } } } }] } }, created_at: { stringValue: '2026-01-01T00:00:00.000Z' } });
  await put('projects/p1', { name: { stringValue: 'App' }, n: { integerValue: '3' }, ok: { booleanValue: true } });
  for (let i = 0; i < 450; i++) await put(`projects/p1/reports/r${String(i).padStart(3, '0')}`, { text: { stringValue: `tamil தமிழ் 😀 ${i}` }, at: { timestampValue: '2026-02-03T04:05:06.789Z' } });
  await put('projects/p1/tasks/r001', { note: { nullValue: null } });
  await put('projects/ghost/reports/r1', { text: { stringValue: 'parent document never written' } });
  await put('auth/code:x', { expire_at: { timestampValue: '2026-12-01T00:00:00Z' }, data: { mapValue: { fields: { a: { doubleValue: 1.5 } } } } });
  await put('rate/device:1', { n: { integerValue: '2' } });

  const before = await backup.dump(call, { base, project, version: 'test' });
  assert.equal(before.documents.length, 1 + 1 + 450 + 1 + 1 + 1, 'every document but the rate counter');
  assert.ok(!before.documents.some((d) => d.path.startsWith('rate/')));
  assert.ok(before.documents.some((d) => d.path === 'projects/ghost/reports/r1'), 'found under a missing parent');
  assert.equal(backup.summarize(before).reports, 451);
  assert.deepEqual(before.unscanned, ['auth/code:x'], 'colon ids are leaf documents; listed, not silently skipped');

  const file = JSON.parse(JSON.stringify(before));   // through JSON, as the file is
  await wipe();
  assert.equal(await backup.restore(call, backup.check(file), { base, project }), before.documents.length);
  assert.equal(await backup.hasData(call, { base, project }), true);
  const after = await backup.dump(call, { base, project, version: 'test' });
  assert.deepEqual(after.documents, before.documents);
});

test('a damaged or foreign file is refused before anything is written', () => {
  assert.throws(() => backup.check({ hello: 1 }), /isn’t a Heresay backup/);
  assert.throws(() => backup.check({ format: 'heresay-backup', format_version: 1, documents: [{ path: '../x', fields: {} }] }), /damaged/);
});
