/**
 * Taking a report back. Whoever sent it (the reporter's device, the team member in a chat app,
 * the agent's repo) can withdraw it while it's still open. Nothing is deleted: it becomes
 * "withdrawn", with who, when and why, and stays in the dashboard under Withdrawn. Once accepted,
 * work may have started, so it can't be taken back; the team is told instead.
 */
import type { Deps, Res } from './handler.js';
import type { Project, Withdrawal } from './types.js';
import { duplicatesOf } from './duplicates.js';
import { LIMITS } from './types.js';

const json = (status: number, body: unknown): Res => ({ status, body });

export async function withdraw(project: Project, id: string, by: Omit<Withdrawal, 'at' | 'reason'>,
  reason: unknown, owns: (device_id: string) => boolean, deps: Deps): Promise<Res> {
  const r = await deps.store.getReport(project.id, id);
  // Not yours and not there look the same, so a device can't probe other reports.
  if (!r || !owns(r.device_id)) return json(404, { error: 'no such report' });
  if (r.status === 'withdrawn') return json(200, { report: r, already: true });
  if (r.status !== 'open') {
    return json(409, { error: r.status === 'accepted'
      ? 'This has been accepted and work may have started, so it can\'t be taken back now. Tell the team instead.'
      : `This is already ${r.status}.`, status: r.status });
  }
  const at = new Date(deps.now()).toISOString();
  const why = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, LIMITS.reasonMax) : null;
  const t = await deps.store.move(project.id, id, 'open', 'withdrawn', { triaged_by: by.by, updated_at: at });
  if (!t.ok) return json(409, { error: 'it changed just now; look again' });
  const withdrawal: Withdrawal = { ...by, at, reason: why };
  await deps.store.updateReport(project.id, id, { withdrawal });
  // Reports merged into it stand on their own again: their reporters still want an answer.
  for (const d of await duplicatesOf(project, id, deps)) await deps.store.updateReport(d.project_id, d.id, { duplicate_of: null });
  deps.log('api.report_withdrawn', { project_id: project.id, report_id: id, kind: by.kind });
  return json(200, { report: { ...t.report, withdrawal } });
}
