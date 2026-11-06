/**
 * The Store contract on CatalystStore, with SQLite standing in for Data Store. This proves the
 * store's logic (compare-and-swap, chunking, escaping); it cannot prove Catalyst itself behaves
 * the way the SQL here assumes. See docs/plan/catalyst-spike.md for what a real run must check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { storeContract } from './store-contract.js';
import { CatalystStore, type Zcql } from '../src/providers/catalyst/catalyst-store.js';
import type { Project, Report, Task, AuthRecord } from '../src/core/types.js';

function sqliteZcql(): Zcql {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE hs_entity (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, ekey TEXT NOT NULL UNIQUE, etype TEXT, ix1 TEXT, ix2 TEXT, ix3 TEXT, ix4 TEXT,
      rev INTEGER, nonce TEXT, claimed TEXT, gen TEXT, nparts INTEGER, body TEXT);
    CREATE TABLE hs_chunk (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, ekey TEXT, gen TEXT, part INTEGER, ix1 TEXT, body TEXT);
  `);
  return {
    async query(sql) {
      // ZCQL's `LIMIT start, count` starts at row 1 (0 and 1 both mean the first), not at an offset.
      const q = sql.replace(/LIMIT (\d+), (\d+)/i, (_m, a, b) => `LIMIT ${b} OFFSET ${Math.max(Number(a) - 1, 0)}`);
      if (/^\s*select/i.test(sql)) return db.prepare(q).all() as Array<Record<string, unknown>>;
      db.exec(sql);
      return [];
    },
  };
}
const make = () => new CatalystStore(sqliteZcql());

storeContract('CatalystStore (SQLite stand-in)', make);

const AT = '2026-09-29T10:00:00.000Z';
const proj = (): Project => ({ id: 'p_x1', name: 'T', platform: 'web', framework: null, key: 'pk_x1', created_by: 'o', allowed_origins: [], created_at: AT });
const rep = (over: Partial<Report> = {}): Report => ({
  id: 'r_x1', project_id: 'p_x1', device_id: 'device_contract_000001', type: 'broken', text: 'It broke',
  context: { route: '/x', app_version: '1.0', platform: 'web', os: null, browser: null, user_id: null, user_label: null, framework: null },
  status: 'open', decline_reason: null, created_at: AT, updated_at: AT, triaged_by: null, ...over,
});
const tsk = (r: Report): Task => ({ id: r.id, project_id: r.project_id, report_id: r.id, type: r.type, text: r.text, context: r.context, note: null, accepted_by: 'owner', accepted_at: AT });

test('CatalystStore: text that Data Store would mangle comes back exactly', async () => {
  const s = make(); await s.createProject(proj());
  const text = `quotes ' " \\ ; -- DROP TABLE hs_entity; emoji 😀🚀 தமிழ் हिन्दी \n newline`;
  await s.createReport(rep({ text }));
  assert.equal((await s.getReport('p_x1', 'r_x1'))?.text, text);
});

test('CatalystStore: a document far over one text column survives, and replacing it leaves no stale chunks', async () => {
  const z = sqliteZcql(); const s = new CatalystStore(z);
  await s.createProject(proj());
  const big = 'தமிழ்😀'.repeat(20_000);              // ~100k characters
  await s.createReport(rep({ text: big }));
  assert.equal((await s.getReport('p_x1', 'r_x1'))?.text, big);
  assert.ok((await z.query('SELECT * FROM hs_chunk WHERE ekey=\'report:p_x1:r_x1\''))!.length > 1, 'it was split');
  await s.updateReport('p_x1', 'r_x1', { text: 'short now' });
  assert.equal((await s.getReport('p_x1', 'r_x1'))?.text, 'short now');
  assert.equal((await z.query('SELECT * FROM hs_chunk')).length, 0, 'old chunks are gone');
});

test('CatalystStore: two accepts at once, one wins and there is one task', async () => {
  const s = make(); await s.createProject(proj()); await s.createReport(rep());
  const r = await Promise.all([1, 2, 3, 4].map(() => s.accept('p_x1', 'r_x1', tsk(rep()), AT)));
  assert.equal(r.filter((x) => x.ok).length, 1);
  assert.equal((await s.listTasks('p_x1')).length, 1);
});

test('CatalystStore: a one-time code is taken by exactly one of several at once', async () => {
  const s = make();
  const rec: AuthRecord = { kind: 'code', id: 'c_one', data: { a: 1 }, expires_at: null };
  await s.putAuth(rec);
  const got = await Promise.all([1, 2, 3, 4, 5].map(() => s.takeAuth('code', 'c_one')));
  assert.equal(got.filter(Boolean).length, 1);
  assert.equal(await s.getAuth('code', 'c_one'), null);
});

test('CatalystStore: concurrent hits never go past the limit', async () => {
  const s = make();
  const r = await Promise.all(Array.from({ length: 12 }, () => s.hit('b:concurrent', 5, Date.now() + 60_000)));
  assert.equal(r.filter(Boolean).length, 5);
});

test('CatalystStore: more than one page of reports comes back whole, with no repeats', async () => {
  const s = make(); await s.createProject(proj());
  for (let i = 0; i < 350; i++) await s.createReport(rep({ id: `r_page${i}`, created_at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z` }));
  const ids = (await s.listReports('p_x1')).map((r) => r.id);
  assert.equal(ids.length, 350);
  assert.equal(new Set(ids).size, 350, 'no row appears twice across the 300-row page boundary');
});

test('CatalystStore: nothing untrusted can reach a statement', async () => {
  const s = make();
  await assert.rejects(() => s.getProject(`p_1' OR '1'='1`));
  await assert.rejects(() => s.getProjectByKey(`x'; DELETE FROM hs_entity; --`));
});
