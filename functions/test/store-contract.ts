/**
 * The behaviour every Store must have, whatever database it sits on. Each backend runs this
 * same suite: MemoryStore in `npm test`, Firestore against the emulator, Catalyst later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Store } from '../src/core/store.js';
import type { AgentToken, Project, Report, Task } from '../src/core/types.js';

const AT = '2026-09-29T10:00:00.000Z';
let n = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function project(owner: string): Project {
  return { id: uid('p_'), name: 'Test', platform: 'web', framework: null, key: uid('pk_'), created_by: owner, allowed_origins: [], created_at: AT };
}
function report(p: Project, over: Partial<Report> = {}): Report {
  return {
    id: uid('r_'), project_id: p.id, device_id: 'device_contract_000001', type: 'broken', text: 'It broke',
    context: { route: '/x', app_version: '1.0', platform: 'web', os: null, browser: null, user_id: null, user_label: null, framework: null },
    status: 'open', decline_reason: null, created_at: AT, updated_at: AT, triaged_by: null, ...over,
  };
}
function task(r: Report): Task {
  return { id: r.id, project_id: r.project_id, report_id: r.id, type: r.type, text: r.text, context: r.context, note: null, accepted_by: 'owner', accepted_at: AT };
}

export function storeContract(name: string, make: () => Store | Promise<Store>) {
  test(`${name}: projects are found by id and key, and all are listed`, async () => {
    const s = await make(); const owner = uid('u_');
    const a = project(owner), b = project(owner);
    for (const p of [a, b]) await s.createProject(p);
    assert.equal((await s.getProject(a.id))?.key, a.key);
    assert.equal((await s.getProjectByKey(b.key))?.id, b.id);
    assert.equal(await s.getProject('p_missing'), null);
    assert.equal(await s.getProjectByKey('pk_missing'), null);
    const listed = (await s.listProjects()).map((p) => p.id);
    assert.ok(listed.includes(a.id) && listed.includes(b.id));
    assert.equal((await s.getProject(a.id))?.platform, 'web');
  });

  test(`${name}: reports stay inside their project and device`, async () => {
    const s = await make(); const p = project(uid('u_')), q = project(uid('u_'));
    await s.createProject(p); await s.createProject(q);
    const r1 = report(p), r2 = report(p, { device_id: 'device_contract_000002' }), r3 = report(q);
    for (const r of [r1, r2, r3]) await s.createReport(r);
    assert.equal((await s.getReport(p.id, r1.id))?.text, 'It broke');
    assert.equal(await s.getReport(q.id, r1.id), null, 'a report is not visible through another project');
    assert.deepEqual((await s.listReports(p.id)).map((r) => r.id).sort(), [r1.id, r2.id].sort());
    assert.deepEqual((await s.listReportsForDevice(p.id, 'device_contract_000002')).map((r) => r.id), [r2.id]);
  });

  test(`${name}: accept moves open to accepted and writes the task, once`, async () => {
    const s = await make(); const p = project(uid('u_')); await s.createProject(p);
    const r = report(p); await s.createReport(r);
    assert.equal(await s.getTask(p.id, r.id), null, 'no task before accept');
    const t = await s.accept(p.id, r.id, task(r), AT);
    assert.ok(t.ok && t.report.status === 'accepted');
    assert.equal((await s.getTask(p.id, r.id))?.report_id, r.id);
    const again = await s.accept(p.id, r.id, task(r), AT);
    assert.deepEqual(again, { ok: false, reason: 'wrong_status', status: 'accepted' });
    assert.deepEqual(await s.accept(p.id, 'r_missing', task(r), AT), { ok: false, reason: 'not_found' });
  });

  test(`${name}: move only happens from the expected status, and keeps the reason`, async () => {
    const s = await make(); const p = project(uid('u_')); await s.createProject(p);
    const r = report(p); await s.createReport(r);
    const wrong = await s.move(p.id, r.id, 'accepted', 'fixed', { triaged_by: 'owner', updated_at: AT });
    assert.deepEqual(wrong, { ok: false, reason: 'wrong_status', status: 'open' });
    const d = await s.move(p.id, r.id, 'open', 'declined', { decline_reason: 'Not a bug', triaged_by: 'owner', updated_at: AT });
    assert.ok(d.ok && d.report.decline_reason === 'Not a bug');
    assert.equal((await s.getReport(p.id, r.id))?.status, 'declined');
    assert.equal(await s.getTask(p.id, r.id), null, 'declining never creates a task');
  });

  test(`${name}: the instance is created once and updated in place`, async () => {
    const s = await make();
    const before = await s.getInstance();
    const email = `${uid('o')}@example.com`;
    const created = await s.updateInstance((cur) => cur
      ? { ...cur, members: [...cur.members, { email, role: 'owner', added_at: AT, added_by: null }] }
      : { created_at: AT, members: [{ email, role: 'owner', added_at: AT, added_by: null }] });
    assert.ok(created.members.some((m) => m.email === email));
    const read = await s.getInstance();
    assert.ok(read && read.members.some((m) => m.email === email));
    assert.equal(read!.members.length, (before?.members.length ?? 0) + 1);
    const removed = await s.updateInstance((cur) => ({ ...cur!, members: cur!.members.filter((m) => m.email !== email) }));
    assert.ok(!removed.members.some((m) => m.email === email));
  });

  test(`${name}: projects can be patched in place`, async () => {
    const s = await make(); const p = project(uid('u_')); await s.createProject(p);
    await s.updateProject(p.id, { framework: 'next', framework_detected: true });
    const got = await s.getProject(p.id);
    assert.equal(got?.framework, 'next');
    assert.equal(got?.framework_detected, true);
    assert.equal(got?.key, p.key, 'the rest is untouched');
  });

  test(`${name}: tasks are listed per project and updated atomically`, async () => {
    const s = await make(); const p = project(uid('u_')), q = project(uid('u_'));
    await s.createProject(p); await s.createProject(q);
    const r1 = report(p), r2 = report(q);
    await s.createReport(r1); await s.createReport(r2);
    await s.accept(p.id, r1.id, { ...task(r1), repo: null, claim: null, notes: [] }, AT);
    await s.accept(q.id, r2.id, task(r2), AT);
    assert.deepEqual((await s.listTasks(p.id)).map((t) => t.id), [r1.id]);
    const next = await s.updateTask(p.id, r1.id, (t) => ({ ...t, claim: { repo: 'github.com/a/b', at: AT } }));
    assert.equal(next?.claim?.repo, 'github.com/a/b');
    assert.equal((await s.getTask(p.id, r1.id))?.claim?.repo, 'github.com/a/b');
    assert.equal(await s.updateTask(p.id, 'r_missing', (t) => t), null);
  });

  test(`${name}: agent tokens are stored, found by id, and revoked by patch`, async () => {
    const s = await make();
    const t: AgentToken = { id: uid('t'), secret_hash: 'h'.repeat(64), repo: 'github.com/a/b', app_ids: ['p_1'],
      created_by: 'a@example.com', created_at: AT, last_used_at: null, revoked_at: null };
    await s.createAgentToken(t);
    assert.equal((await s.getAgentToken(t.id))?.repo, 'github.com/a/b');
    assert.ok((await s.listAgentTokens()).some((x) => x.id === t.id));
    await s.updateAgentToken(t.id, { revoked_at: AT });
    assert.equal((await s.getAgentToken(t.id))?.revoked_at, AT);
    assert.equal(await s.getAgentToken('t_missing'), null);
  });

  test(`${name}: hit counts up to the limit and no further, per bucket`, async () => {
    const s = await make(); const b = uid('bucket:'), c = uid('bucket:'); const exp = Date.now() + 60_000;
    assert.equal(await s.hit(b, 2, exp), true);
    assert.equal(await s.hit(b, 2, exp), true);
    assert.equal(await s.hit(b, 2, exp), false);
    assert.equal(await s.hit(c, 2, exp), true, 'buckets are independent');
  });
}
