/**
 * Duplicates. A person merges a report into another one about the same thing: the merged one
 * leaves the inbox, its reporter's words go with the brief, and its status, reason and fix note
 * follow the one it was merged into, so every reporter hears the outcome. Heresay only suggests
 * (the dashboard); nothing is merged without a person.
 */
import type { Deps, Res } from './handler.js';
import type { AlsoReported, Member, Project, Report, ReportStatus } from './types.js';

const json = (status: number, body: unknown): Res => ({ status, body });

/** Every app of the same product: Greenroom on the web, iOS and the Mac is one inbox. */
export async function productApps(project: Project, deps: Deps): Promise<Project[]> {
  const key = project.product_id ?? project.id;
  return (await deps.store.listProjects()).filter((p) => (p.product_id ?? p.id) === key);
}

/** The reports merged into this one, across the product's apps. */
export async function duplicatesOf(project: Project, primary_id: string, deps: Deps): Promise<Report[]> {
  const out: Report[] = [];
  for (const p of await productApps(project, deps)) {
    for (const r of await deps.store.listReports(p.id)) if (r.duplicate_of?.report_id === primary_id) out.push(r);
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export const alsoReported = (rs: Report[]): AlsoReported[] =>
  rs.map((r) => ({ report_id: r.id, type: r.type, text: r.text, created_at: r.created_at, source: r.source ?? 'sdk' }));

/**
 * POST /v1/projects/:p/reports/:id/merge { into, into_app? }: this report is about the same thing
 * as `into`. Both in one product. `into` may be open or accepted (then this one is accepted too
 * and joins the brief); this one must be open. Reports already merged into this one move along.
 */
export async function merge(project: Project, id: string, body: Record<string, unknown>, me: Member, deps: Deps): Promise<Res> {
  const report = await deps.store.getReport(project.id, id);
  if (!report) return json(404, { error: 'no such report' });
  if (report.status !== 'open') return json(409, { error: `only open reports can be merged; this one is ${report.status}` });
  const intoId = typeof body.into === 'string' ? body.into.trim() : '';
  if (!intoId || intoId === id) return json(400, { error: 'say which report this is a duplicate of' });
  const apps = await productApps(project, deps);
  let target: Report | null = null, targetApp: Project | undefined;
  for (const p of apps) {
    if (typeof body.into_app === 'string' && body.into_app !== p.id) continue;
    target = await deps.store.getReport(p.id, intoId);
    if (target) { targetApp = p; break; }
  }
  if (!target || !targetApp) return json(404, { error: 'no such report in this product to merge into' });
  // Into the report it was merged into, if that one is a duplicate itself: one level, no chains.
  if (target.duplicate_of) {
    const top = await deps.store.getReport(target.duplicate_of.project_id, target.duplicate_of.report_id);
    const topApp = apps.find((p) => p.id === target!.duplicate_of!.project_id);
    if (!top || !topApp) return json(409, { error: 'that report was merged into one that no longer exists' });
    target = top; targetApp = topApp;
  }
  if (target.id === id) return json(400, { error: 'a report can\'t be merged into itself' });
  if (target.status !== 'open' && target.status !== 'accepted') {
    return json(409, { error: `that report is already ${target.status}; merge into an open or accepted one` });
  }
  const at = new Date(deps.now()).toISOString();
  const dup = { project_id: targetApp.id, report_id: target.id, by: me.email, at };
  const moving = [report, ...await duplicatesOf(project, id, deps)];
  for (const r of moving) {
    await deps.store.updateReport(r.project_id, r.id, { duplicate_of: dup, updated_at: at });
    // Into an accepted report: these are accepted too, and their words join the brief.
    if (target.status === 'accepted' && r.status === 'open') {
      await deps.store.move(r.project_id, r.id, 'open', 'accepted', { triaged_by: me.email, updated_at: at });
    }
  }
  if (target.status === 'accepted') {
    const add = alsoReported(moving);
    await deps.store.updateTask(targetApp.id, target.id, (t) => ({
      ...t, also_reported: [...(t.also_reported ?? []).filter((a) => !add.some((x) => x.report_id === a.report_id)), ...add],
    }));
    await deps.store.updateReport(targetApp.id, target.id, { updated_at: at });
  }
  deps.log('api.report_merged', { project_id: project.id, report_id: id, into: target.id, by: me.email, moved: moving.length });
  return json(200, { merged: moving.map((r) => r.id), into: { project_id: targetApp.id, report_id: target.id, status: target.status } });
}

/** POST /v1/projects/:p/reports/:id/unmerge: a mistaken merge, undone while both are still open. */
export async function unmerge(project: Project, id: string, me: Member, deps: Deps): Promise<Res> {
  const report = await deps.store.getReport(project.id, id);
  if (!report) return json(404, { error: 'no such report' });
  if (!report.duplicate_of) return json(409, { error: 'this report isn\'t merged into another' });
  if (report.status !== 'open') return json(409, { error: `it has already followed that report to ${report.status}; it can't be separated now` });
  await deps.store.updateReport(project.id, id, { duplicate_of: null, updated_at: new Date(deps.now()).toISOString() });
  deps.log('api.report_unmerged', { project_id: project.id, report_id: id, by: me.email });
  return json(200, { report_id: id });
}

/**
 * The report they were merged into moved: duplicates move the same way, with the same reason
 * or fix note, so each reporter sees the outcome in their app.
 */
export async function follow(project: Project, primary_id: string, from: ReportStatus, to: ReportStatus,
  patch: { decline_reason?: string; fix_note?: string | null; triaged_by: string; updated_at: string }, deps: Deps): Promise<number> {
  let n = 0;
  for (const d of await duplicatesOf(project, primary_id, deps)) {
    if (d.status !== from) continue;
    const r = await deps.store.move(d.project_id, d.id, from, to, patch);
    if (r.ok) n++;
  }
  return n;
}

/** Set (or add to) the proof of a fix on a report and everything merged into it. */
export async function stampFix(project: Project, report_id: string, ref: Partial<import('./types.js').FixRef>, deps: Deps): Promise<void> {
  const all = [await deps.store.getReport(project.id, report_id), ...await duplicatesOf(project, report_id, deps)].filter((r): r is Report => !!r);
  for (const r of all) {
    const cur = r.fix_ref ?? { pr: null, commit: null, version: null, released_at: null };
    const next = { pr: ref.pr ?? cur.pr, commit: ref.commit ?? cur.commit, version: ref.version ?? cur.version, released_at: ref.released_at ?? cur.released_at };
    await deps.store.updateReport(r.project_id, r.id, { fix_ref: next, updated_at: new Date(deps.now()).toISOString() });
  }
}

const VERSION = /^[\w.+-]{1,40}$/;
/** A PR as an http(s) URL, a commit as 7 to 40 hex, a version as up to 40 plain characters. */
export function parseFixRef(b: Record<string, unknown>): { ref: Partial<import('./types.js').FixRef>; error?: string } {
  const ref: Partial<import('./types.js').FixRef> = {};
  if (b.pr != null && b.pr !== '') {
    try {
      const u = new URL(String(b.pr));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw 0;
      ref.pr = u.href.slice(0, 300);
    } catch { return { ref, error: 'pr must be a link to the pull request' }; }
  }
  if (b.commit != null && b.commit !== '') {
    if (!/^[0-9a-f]{7,40}$/i.test(String(b.commit))) return { ref, error: 'commit must be a git hash' };
    ref.commit = String(b.commit).toLowerCase();
  }
  if (b.version != null && b.version !== '') {
    if (!VERSION.test(String(b.version).trim())) return { ref, error: 'version must be like 1.4 or 2.0.1-beta' };
    ref.version = String(b.version).trim();
  }
  return { ref };
}
