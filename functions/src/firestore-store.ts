import type { Firestore } from 'firebase-admin/firestore';
import type { Store, Transition } from './store.js';
import type { Project, Report, ReportStatus, Task } from './types.js';

/**
 * projects/{project_id}
 * projects/{project_id}/reports/{report_id}
 * projects/{project_id}/tasks/{report_id}    written only by accept(), read only by the prompt
 * rate/{bucket}                               has expire_at for a Firestore TTL policy
 *
 * Clients never touch Firestore directly (firestore.rules denies everything); all of it goes
 * through the function.
 */
export class FirestoreStore implements Store {
  constructor(private db: Firestore) {}

  private projects() { return this.db.collection('projects'); }
  private reports(p: string) { return this.projects().doc(p).collection('reports'); }
  private tasks(p: string) { return this.projects().doc(p).collection('tasks'); }

  async createProject(p: Project) { await this.projects().doc(p.id).create(p); }
  async getProject(id: string) {
    const s = await this.projects().doc(id).get();
    return s.exists ? s.data() as Project : null;
  }
  async getProjectByKey(key: string) {
    const q = await this.projects().where('key', '==', key).limit(1).get();
    return q.empty ? null : q.docs[0].data() as Project;
  }
  async listProjects(owner_uid: string) {
    const q = await this.projects().where('owner_uid', '==', owner_uid).get();
    return q.docs.map((d) => d.data() as Project);
  }

  async createReport(r: Report) { await this.reports(r.project_id).doc(r.id).create(r); }
  async getReport(project_id: string, id: string) {
    const s = await this.reports(project_id).doc(id).get();
    return s.exists ? s.data() as Report : null;
  }
  async listReports(project_id: string) {
    const q = await this.reports(project_id).orderBy('created_at', 'desc').limit(500).get();
    return q.docs.map((d) => d.data() as Report);
  }
  async listReportsForDevice(project_id: string, device_id: string) {
    const q = await this.reports(project_id).where('device_id', '==', device_id).limit(50).get();
    return q.docs.map((d) => d.data() as Report);
  }

  async accept(project_id: string, report_id: string, task: Task, at: string): Promise<Transition> {
    const ref = this.reports(project_id).doc(report_id);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return { ok: false, reason: 'not_found' } as const;
      const r = s.data() as Report;
      if (r.status !== 'open') return { ok: false, reason: 'wrong_status', status: r.status } as const;
      const next: Report = { ...r, status: 'accepted', triaged_by: task.accepted_by, updated_at: at };
      tx.set(ref, next);
      tx.create(this.tasks(project_id).doc(report_id), task);
      return { ok: true, report: next } as const;
    });
  }

  async move(
    project_id: string, report_id: string, from: ReportStatus, to: ReportStatus,
    patch: { decline_reason?: string; triaged_by: string; updated_at: string },
  ): Promise<Transition> {
    const ref = this.reports(project_id).doc(report_id);
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return { ok: false, reason: 'not_found' } as const;
      const r = s.data() as Report;
      if (r.status !== from) return { ok: false, reason: 'wrong_status', status: r.status } as const;
      const next: Report = {
        ...r, status: to, triaged_by: patch.triaged_by, updated_at: patch.updated_at,
        decline_reason: patch.decline_reason ?? r.decline_reason,
      };
      tx.set(ref, next);
      return { ok: true, report: next } as const;
    });
  }

  async getTask(project_id: string, report_id: string) {
    const s = await this.tasks(project_id).doc(report_id).get();
    return s.exists ? s.data() as Task : null;
  }

  async hit(bucket: string, limit: number, expires_at: number) {
    const ref = this.db.collection('rate').doc(bucket.replaceAll('/', '_'));
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const n = s.exists ? (s.data()!.n as number) : 0;
      if (n >= limit) return false;
      tx.set(ref, { n: n + 1, expire_at: new Date(expires_at) });
      return true;
    });
  }
}
