import { randomBytes } from 'node:crypto';
import type { Store, Transition } from '../../core/store.js';
import type { AgentToken, AuthKind, AuthRecord, Instance, Project, Report, ReportStatus, Task } from '../../core/types.js';

/**
 * A Store on Catalyst Data Store (ZCQL). SPIKE: written against the Store contract and a SQLite
 * stand-in; it has not run on a real Catalyst project yet. See docs/plan/catalyst-spike.md for
 * the tables and for what a real run still has to prove.
 *
 * Why it looks the way it does, all from Data Store's limits:
 *  - No transactions, so every read-modify-write is compare-and-swap: one `UPDATE ... WHERE
 *    rev = N`, then a read to see whether our nonce is the one that landed.
 *  - Text columns hold 10,000 characters and a report can carry 100,000 (a document), so a body is
 *    base64 and, if long, split over `hs_chunk` rows that a new generation swaps in at once.
 *  - Emoji are silently turned into `?`, and string escaping in ZCQL is not something to trust.
 *    Base64 has neither problem, and every other value put in a statement is checked against a
 *    short allow-list of characters first, so no statement can be built from untrusted text.
 *
 * Rows of `hs_entity` (one per thing):
 *   ekey    unique, `<type>:<...ids>`           etype  'instance'|'project'|'report'|'task'|'token'|'auth'|'rate'
 *   ix1..4  what that type is looked up by       rev, nonce  compare-and-swap
 *   claimed one-shot claim (takeAuth)            gen, nparts, body   the document
 */

/** Runs one ZCQL statement and returns its rows, flattened (no table-name wrapper). */
export interface Zcql { query(sql: string): Promise<Array<Record<string, unknown>>> }

const T = 'hs_entity';
const C = 'hs_chunk';
const BODY_MAX = 8000;      // base64 characters per row, under the 10,000 of a text column
const PAGE = 300;           // ZCQL returns at most 300 rows
const RETRIES = 8;

const SAFE = /^[A-Za-z0-9_:.@+=/ -]*$/;
/** The only way a value gets into a statement. */
function lit(v: string | number): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('bad number');
    return String(Math.trunc(v));
  }
  if (!SAFE.test(v)) throw new Error(`unsafe value in statement: ${JSON.stringify(v.slice(0, 40))}`);
  return `'${v}'`;
}

/** ROWID is a bigint that can pass 2^53: keep it as the digits it came as. */
function rowid(v: string): string {
  if (!/^\d+$/.test(v)) throw new Error('bad ROWID');
  return v;
}

const enc = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64');
const dec = <D>(s: string) => JSON.parse(Buffer.from(s, 'base64').toString('utf8')) as D;
const nonce = () => randomBytes(9).toString('base64url');
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? '' : String(v));

type Ix = { ix1?: string; ix2?: string; ix3?: string; ix4?: string };
interface Head { ROWID: string; ekey: string; etype: string; rev: number; nonce: string; claimed: string; gen: string; nparts: number; body: string; ix: Required<Ix> }

function head(r: Record<string, unknown>): Head {
  return {
    ROWID: str(r.ROWID), ekey: str(r.ekey), etype: str(r.etype), rev: num(r.rev), nonce: str(r.nonce), claimed: str(r.claimed),
    gen: str(r.gen), nparts: num(r.nparts), body: str(r.body),
    ix: { ix1: str(r.ix1), ix2: str(r.ix2), ix3: str(r.ix3), ix4: str(r.ix4) },
  };
}

const ixSet = (ix: Ix) => `ix1=${lit(ix.ix1 ?? '')}, ix2=${lit(ix.ix2 ?? '')}, ix3=${lit(ix.ix3 ?? '')}, ix4=${lit(ix.ix4 ?? '')}`;

export class CatalystStore implements Store {
  constructor(private z: Zcql) {}

  // ---- primitives ----------------------------------------------------------------------

  /**
   * Pages through a SELECT, since one statement returns at most 300 rows. ZCQL's `LIMIT start, count`
   * counts rows from 1 (0 and 1 both mean the first row), unlike SQL's offset: checked on a real project.
   */
  private async select(table: string, where: string, order = '', limit = Infinity): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    while (out.length < limit) {
      const n = Math.min(PAGE, limit - out.length);
      const rows = await this.z.query(`SELECT * FROM ${table} WHERE ${where}${order ? ' ORDER BY ' + order : ''} LIMIT ${out.length + 1}, ${n}`);
      out.push(...rows);
      if (rows.length < n) break;
    }
    return out;
  }

  private async load(h: Head): Promise<string> {
    if (h.nparts === 0) return h.body;
    const rows = await this.select(C, `ekey=${lit(h.ekey)} AND gen=${lit(h.gen)}`, 'part');
    if (rows.length !== h.nparts) throw new Error(`incomplete document ${h.ekey}`);
    return rows.sort((a, b) => num(a.part) - num(b.part)).map((r) => str(r.body)).join('');
  }

  private async readHead(ekey: string): Promise<Head | null> {
    const rows = await this.z.query(`SELECT * FROM ${T} WHERE ekey=${lit(ekey)} LIMIT 0, 1`);
    return rows[0] ? head(rows[0]) : null;
  }

  private async read<D>(ekey: string): Promise<{ h: Head; doc: D } | null> {
    const h = await this.readHead(ekey);
    return h ? { h, doc: dec<D>(await this.load(h)) } : null;
  }

  private async readMany<D>(rows: Array<Record<string, unknown>>): Promise<D[]> {
    const out: D[] = [];
    for (const r of rows) { const h = head(r); out.push(dec<D>(await this.load(h))); }
    return out;
  }

  /** Writes the body: inline if it fits, else as a new generation of chunk rows. Returns the columns for the head. */
  private async stage(ekey: string, ix1: string, doc: unknown) {
    const b64 = enc(doc);
    if (b64.length <= BODY_MAX) return { gen: '', nparts: 0, body: b64, undo: async () => {} };
    const gen = nonce();
    const parts: string[] = [];
    for (let i = 0; i < b64.length; i += BODY_MAX) parts.push(b64.slice(i, i + BODY_MAX));
    const undo = () => this.z.query(`DELETE FROM ${C} WHERE ekey=${lit(ekey)} AND gen=${lit(gen)}`).then(() => {});
    try {
      for (let i = 0; i < parts.length; i++) {
        await this.z.query(`INSERT INTO ${C} (ekey, gen, part, ix1, body) VALUES (${lit(ekey)}, ${lit(gen)}, ${i}, ${lit(ix1)}, ${lit(parts[i])})`);
      }
    } catch (e) { await undo().catch(() => {}); throw e; }
    return { gen, nparts: parts.length, body: '', undo };
  }

  private async dropOldChunks(ekey: string, keepGen: string) {
    await this.z.query(`DELETE FROM ${C} WHERE ekey=${lit(ekey)} AND gen<>${lit(keepGen)}`).catch(() => {});
  }

  /** Creates the row. Throws if it exists (the unique ekey is the real guard; this is the early, clear error). */
  private async insert(ekey: string, etype: string, ix: Ix, doc: unknown): Promise<void> {
    if (await this.readHead(ekey)) throw new Error(`already exists: ${ekey}`);
    const s = await this.stage(ekey, ix.ix1 ?? '', doc);
    try {
      await this.z.query(
        `INSERT INTO ${T} (ekey, etype, ix1, ix2, ix3, ix4, rev, nonce, claimed, gen, nparts, body) VALUES `
        + `(${lit(ekey)}, ${lit(etype)}, ${lit(ix.ix1 ?? '')}, ${lit(ix.ix2 ?? '')}, ${lit(ix.ix3 ?? '')}, ${lit(ix.ix4 ?? '')}, 1, ${lit(nonce())}, '', ${lit(s.gen)}, ${s.nparts}, ${lit(s.body)})`,
      );
    } catch (e) { await s.undo().catch(() => {}); throw e; }
  }

  /** Compare-and-swap: replace the document only if nobody has since. */
  private async swap(h: Head, doc: unknown, ix: Ix = h.ix): Promise<boolean> {
    const s = await this.stage(h.ekey, ix.ix1 ?? h.ix.ix1, doc);
    const mine = nonce();
    await this.z.query(
      `UPDATE ${T} SET ${ixSet({ ...h.ix, ...ix })}, rev=${h.rev + 1}, nonce=${lit(mine)}, gen=${lit(s.gen)}, nparts=${s.nparts}, body=${lit(s.body)} `
      + `WHERE ROWID=${rowid(h.ROWID)} AND rev=${h.rev}`,
    );
    const now = await this.readHead(h.ekey);
    const won = !!now && now.nonce === mine;
    if (won) await this.dropOldChunks(h.ekey, s.gen);
    else await s.undo().catch(() => {});
    return won;
  }

  /** Read, change, swap; again from the top if someone got in between. `fn` returns null to leave it alone. */
  private async modify<D>(ekey: string, fn: (cur: D) => D | null, ix?: (next: D) => Ix): Promise<D | null> {
    for (let i = 0; i < RETRIES; i++) {
      const cur = await this.read<D>(ekey);
      if (!cur) return null;
      const next = fn(cur.doc);
      if (next === null) return cur.doc;
      if (await this.swap(cur.h, next, ix?.(next))) return next;
    }
    throw new Error(`too much contention on ${ekey}`);
  }

  private async remove(ekey: string) {
    await this.z.query(`DELETE FROM ${C} WHERE ekey=${lit(ekey)}`);
    await this.z.query(`DELETE FROM ${T} WHERE ekey=${lit(ekey)}`);
  }

  // ---- keys and indexes ------------------------------------------------------------------

  private reportIx = (r: Report): Ix => ({ ix1: r.project_id, ix2: r.device_id, ix3: r.created_at, ix4: r.updated_at });
  private rk = (p: string, id: string) => `report:${p}:${id}`;
  private tk = (p: string, id: string) => `task:${p}:${id}`;

  // ---- Store ---------------------------------------------------------------------------

  async getInstance() { return (await this.read<Instance>('instance'))?.doc ?? null; }
  async updateInstance(fn: (current: Instance | null) => Instance) {
    for (let i = 0; i < RETRIES; i++) {
      const cur = await this.read<Instance>('instance');
      const next = fn(cur ? structuredClone(cur.doc) : null);
      if (!cur) {
        try { await this.insert('instance', 'instance', {}, next); return next; } catch (e) { if (!/exists|unique|duplicate/i.test(String(e))) throw e; continue; }
      }
      if (await this.swap(cur.h, next)) return next;
    }
    throw new Error('too much contention on the instance');
  }

  async createProject(p: Project) { await this.insert(`project:${p.id}`, 'project', { ix1: p.key }, p); }
  async getProject(id: string) { return (await this.read<Project>(`project:${id}`))?.doc ?? null; }
  async getProjectByKey(key: string) {
    const rows = await this.z.query(`SELECT * FROM ${T} WHERE etype='project' AND ix1=${lit(key)} LIMIT 0, 1`);
    return rows[0] ? (await this.readMany<Project>(rows))[0] : null;
  }
  async listProjects() { return this.readMany<Project>(await this.select(T, `etype='project'`, 'ROWID')); }
  async updateProject(id: string, patch: Partial<Project>) {
    const { id: _ignored, ...rest } = patch;
    await this.modify<Project>(`project:${id}`, (p) => ({ ...p, ...rest }), (p) => ({ ix1: p.key }));
  }
  async deleteProject(id: string) {
    await this.z.query(`DELETE FROM ${C} WHERE ix1=${lit(id)}`);
    await this.z.query(`DELETE FROM ${T} WHERE ix1=${lit(id)} AND etype IN ('report', 'task')`);
    await this.remove(`project:${id}`);
  }

  async createReport(r: Report) { await this.insert(this.rk(r.project_id, r.id), 'report', this.reportIx(r), r); }
  async getReport(project_id: string, id: string) { return (await this.read<Report>(this.rk(project_id, id)))?.doc ?? null; }
  async listReports(project_id: string) {
    return this.readMany<Report>(await this.select(T, `etype='report' AND ix1=${lit(project_id)}`, 'ix3 DESC', 500));
  }
  async listReportsSince(project_id: string, since: string) {
    const rows = await this.select(T, `etype='report' AND ix1=${lit(project_id)} AND ix4>${lit(since)}`, 'ix4', 500);
    return (await this.readMany<Report>(rows)).filter((r) => r.updated_at > since);
  }
  async listReportsForDevice(project_id: string, device_id: string) {
    return this.readMany<Report>(await this.select(T, `etype='report' AND ix1=${lit(project_id)} AND ix2=${lit(device_id)}`, 'ix3 DESC', 50));
  }
  async updateReport(project_id: string, id: string, patch: Partial<Report>) {
    const { id: _i, project_id: _p, status: _s, ...rest } = patch;
    await this.modify<Report>(this.rk(project_id, id), (r) => ({ ...r, ...rest }), this.reportIx);
  }

  async accept(project_id: string, report_id: string, task: Task, at: string): Promise<Transition> {
    const t = await this.moveWith(project_id, report_id, 'open', (r) => ({ ...r, status: 'accepted' as const, triaged_by: task.accepted_by, updated_at: at }));
    if (!t.ok) return t;
    // The claim above is what makes this the one accept. A crash before this line leaves an
    // accepted report with no task, which fails closed: nothing reaches an agent without a task.
    await this.insert(this.tk(project_id, report_id), 'task', { ix1: project_id }, task).catch((e) => { if (!/exists|unique|duplicate/i.test(String(e))) throw e; });
    return t;
  }

  async move(
    project_id: string, report_id: string, from: ReportStatus, to: ReportStatus,
    patch: { decline_reason?: string; fix_note?: string | null; triaged_by: string; updated_at: string },
  ): Promise<Transition> {
    return this.moveWith(project_id, report_id, from, (r) => ({
      ...r, status: to, triaged_by: patch.triaged_by, updated_at: patch.updated_at,
      decline_reason: patch.decline_reason ?? r.decline_reason,
      fix_note: patch.fix_note !== undefined ? patch.fix_note : (r.fix_note ?? null),
    }));
  }

  /** The status change, once: only from `from`, and only the writer whose swap lands gets `ok`. */
  private async moveWith(project_id: string, report_id: string, from: ReportStatus, next: (r: Report) => Report): Promise<Transition> {
    const ekey = this.rk(project_id, report_id);
    for (let i = 0; i < RETRIES; i++) {
      const cur = await this.read<Report>(ekey);
      if (!cur) return { ok: false, reason: 'not_found' };
      if (cur.doc.status !== from) return { ok: false, reason: 'wrong_status', status: cur.doc.status };
      const r = next(cur.doc);
      if (await this.swap(cur.h, r, this.reportIx(r))) return { ok: true, report: r };
    }
    throw new Error(`too much contention on ${ekey}`);
  }

  async getTask(project_id: string, report_id: string) { return (await this.read<Task>(this.tk(project_id, report_id)))?.doc ?? null; }
  async listTasks(project_id: string) { return this.readMany<Task>(await this.select(T, `etype='task' AND ix1=${lit(project_id)}`, 'ROWID', 500)); }
  async updateTask(project_id: string, report_id: string, fn: (t: Task) => Task) {
    return this.modify<Task>(this.tk(project_id, report_id), (t) => fn(structuredClone(t)));
  }

  async createAgentToken(t: AgentToken) { await this.insert(`token:${t.id}`, 'token', {}, t); }
  async getAgentToken(id: string) { return (await this.read<AgentToken>(`token:${id}`))?.doc ?? null; }
  async listAgentTokens() { return this.readMany<AgentToken>(await this.select(T, `etype='token'`, 'ROWID')); }
  async updateAgentToken(id: string, patch: Partial<AgentToken>) {
    const { id: _ignored, ...rest } = patch;
    await this.modify<AgentToken>(`token:${id}`, (t) => ({ ...t, ...rest }));
  }

  private ak = (kind: AuthKind, id: string) => `auth:${kind}:${id}`;
  async putAuth(r: AuthRecord) {
    const ix = { ix1: r.kind, ix2: r.expires_at ?? '' };
    for (let i = 0; i < RETRIES; i++) {
      const cur = await this.readHead(this.ak(r.kind, r.id));
      if (!cur) {
        try { await this.insert(this.ak(r.kind, r.id), 'auth', ix, r); return; } catch (e) { if (!/exists|unique|duplicate/i.test(String(e))) throw e; continue; }
      }
      if (await this.swap(cur, r, ix)) return;
    }
    throw new Error('too much contention on an auth record');
  }
  async getAuth(kind: AuthKind, id: string) { return (await this.read<AuthRecord>(this.ak(kind, id)))?.doc ?? null; }
  /** One claimer wins: `claimed` can only go from empty to a nonce once. Whoever loses gets null for good. */
  async takeAuth(kind: AuthKind, id: string) {
    const ekey = this.ak(kind, id);
    const cur = await this.read<AuthRecord>(ekey);
    if (!cur || cur.h.claimed) return null;
    const mine = nonce();
    await this.z.query(`UPDATE ${T} SET claimed=${lit(mine)} WHERE ROWID=${rowid(cur.h.ROWID)} AND claimed=''`);
    const now = await this.readHead(ekey);
    if (!now || now.claimed !== mine) return null;
    await this.remove(ekey);
    return cur.doc;
  }
  async deleteAuth(kind: AuthKind, id: string) { await this.remove(this.ak(kind, id)); }
  async listAuth(kind: AuthKind) { return this.readMany<AuthRecord>(await this.select(T, `etype='auth' AND ix1=${lit(kind)}`, 'ROWID')); }

  /**
   * Rate counters. Correct, but every hit is a SELECT and an UPDATE against a small monthly Data
   * Store quota: the Catalyst adapter should count in memory (see LiteStore) and keep this for
   * the contract only.
   */
  async hit(bucket: string, limit: number, expires_at: number) {
    const ekey = `rate:${bucket}`;
    const ix = { ix2: String(expires_at) };
    for (let i = 0; i < RETRIES; i++) {
      const cur = await this.read<{ n: number }>(ekey);
      if (!cur) {
        try { await this.insert(ekey, 'rate', ix, { n: 1 }); return true; } catch (e) { if (!/exists|unique|duplicate/i.test(String(e))) throw e; continue; }
      }
      if (cur.doc.n >= limit) return false;
      if (await this.swap(cur.h, { n: cur.doc.n + 1 }, ix)) return true;
    }
    throw new Error('too much contention on a rate counter');
  }
}
