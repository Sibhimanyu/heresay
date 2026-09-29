import type { AgentToken, Instance, Project, Report, ReportStatus, Task } from './types.js';

/** Result of a status change. A lost race is not an error: the caller is told what it is now. */
export type Transition =
  | { ok: true; report: Report }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'wrong_status'; status: ReportStatus };

export interface Store {
  /** The team that owns this install, or null before `create-heresay` has written it. */
  getInstance(): Promise<Instance | null>;
  /** Atomic read-modify-write of the team. `fn` may throw to abort. */
  updateInstance(fn: (current: Instance | null) => Instance): Promise<Instance>;

  createProject(p: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  getProjectByKey(key: string): Promise<Project | null>;
  /** Every app in this install. The whole team sees all of them. */
  listProjects(): Promise<Project[]>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;

  createReport(r: Report): Promise<void>;
  getReport(project_id: string, id: string): Promise<Report | null>;
  listReports(project_id: string): Promise<Report[]>;
  listReportsForDevice(project_id: string, device_id: string): Promise<Report[]>;

  /** Atomic: open -> accepted and the task is written together, or neither happens. */
  accept(project_id: string, report_id: string, task: Task, at: string): Promise<Transition>;
  /** Atomic: status must be `from`, becomes `to`. */
  move(
    project_id: string, report_id: string, from: ReportStatus, to: ReportStatus,
    patch: { decline_reason?: string; fix_note?: string | null; triaged_by: string; updated_at: string },
  ): Promise<Transition>;
  getTask(project_id: string, report_id: string): Promise<Task | null>;
  listTasks(project_id: string): Promise<Task[]>;
  /** Atomic read-modify-write of a task. Null if there is no such task. `fn` may throw to abort. */
  updateTask(project_id: string, report_id: string, fn: (t: Task) => Task): Promise<Task | null>;

  createAgentToken(t: AgentToken): Promise<void>;
  getAgentToken(id: string): Promise<AgentToken | null>;
  listAgentTokens(): Promise<AgentToken[]>;
  updateAgentToken(id: string, patch: Partial<AgentToken>): Promise<void>;

  /**
   * Count one hit against `bucket`. Returns false, and counts nothing, if `limit` is reached.
   * `expires_at` is when the bucket can be deleted.
   */
  hit(bucket: string, limit: number, expires_at: number): Promise<boolean>;
}

/** For tests and local runs. Same semantics as the Firestore store, no persistence. */
export class MemoryStore implements Store {
  instance: Instance | null = null;
  projects = new Map<string, Project>();
  reports = new Map<string, Report>();
  tasks = new Map<string, Task>();
  tokens = new Map<string, AgentToken>();
  buckets = new Map<string, number>();

  async getInstance() { return this.instance ? structuredClone(this.instance) : null; }
  async updateInstance(fn: (current: Instance | null) => Instance) {
    const next = fn(this.instance ? structuredClone(this.instance) : null);
    this.instance = structuredClone(next);
    return structuredClone(next);
  }

  async createProject(p: Project) { this.projects.set(p.id, { ...p }); }
  async getProject(id: string) { return this.projects.get(id) ?? null; }
  async getProjectByKey(key: string) {
    return [...this.projects.values()].find((p) => p.key === key) ?? null;
  }
  async listProjects() { return [...this.projects.values()]; }
  async updateProject(id: string, patch: Partial<Project>) {
    const p = this.projects.get(id);
    if (p) this.projects.set(id, { ...p, ...patch, id });
  }

  async createReport(r: Report) { this.reports.set(r.id, { ...r }); }
  async getReport(project_id: string, id: string) {
    const r = this.reports.get(id);
    return r && r.project_id === project_id ? r : null;
  }
  async listReports(project_id: string) {
    return [...this.reports.values()].filter((r) => r.project_id === project_id);
  }
  async listReportsForDevice(project_id: string, device_id: string) {
    return (await this.listReports(project_id)).filter((r) => r.device_id === device_id);
  }

  async accept(project_id: string, report_id: string, task: Task, at: string): Promise<Transition> {
    const r = this.reports.get(report_id);
    if (!r || r.project_id !== project_id) return { ok: false, reason: 'not_found' };
    if (r.status !== 'open') return { ok: false, reason: 'wrong_status', status: r.status };
    const next: Report = { ...r, status: 'accepted', triaged_by: task.accepted_by, updated_at: at };
    this.reports.set(report_id, next);
    this.tasks.set(`${project_id}/${report_id}`, { ...task });
    return { ok: true, report: next };
  }

  async move(
    project_id: string, report_id: string, from: ReportStatus, to: ReportStatus,
    patch: { decline_reason?: string; fix_note?: string | null; triaged_by: string; updated_at: string },
  ): Promise<Transition> {
    const r = this.reports.get(report_id);
    if (!r || r.project_id !== project_id) return { ok: false, reason: 'not_found' };
    if (r.status !== from) return { ok: false, reason: 'wrong_status', status: r.status };
    const next: Report = {
      ...r, status: to, triaged_by: patch.triaged_by, updated_at: patch.updated_at,
      decline_reason: patch.decline_reason ?? r.decline_reason,
      fix_note: patch.fix_note !== undefined ? patch.fix_note : (r.fix_note ?? null),
    };
    this.reports.set(report_id, next);
    return { ok: true, report: next };
  }

  async getTask(project_id: string, report_id: string) {
    const t = this.tasks.get(`${project_id}/${report_id}`);
    return t ? structuredClone(t) : null;
  }
  async listTasks(project_id: string) {
    return [...this.tasks.values()].filter((t) => t.project_id === project_id).map((t) => structuredClone(t));
  }
  async updateTask(project_id: string, report_id: string, fn: (t: Task) => Task) {
    const k = `${project_id}/${report_id}`;
    const t = this.tasks.get(k);
    if (!t) return null;
    const next = fn(structuredClone(t));
    this.tasks.set(k, structuredClone(next));
    return structuredClone(next);
  }

  async createAgentToken(t: AgentToken) { this.tokens.set(t.id, structuredClone(t)); }
  async getAgentToken(id: string) { const t = this.tokens.get(id); return t ? structuredClone(t) : null; }
  async listAgentTokens() { return [...this.tokens.values()].map((t) => structuredClone(t)); }
  async updateAgentToken(id: string, patch: Partial<AgentToken>) {
    const t = this.tokens.get(id);
    if (t) this.tokens.set(id, { ...t, ...patch, id });
  }

  async hit(bucket: string, limit: number) {
    const n = this.buckets.get(bucket) ?? 0;
    if (n >= limit) return false;
    this.buckets.set(bucket, n + 1);
    return true;
  }
}
