/**
 * Coding agents. A repo gets a token from `npx heresay connect`; with it, an agent sees the
 * accepted briefs for the apps whose code is in that repo, and can claim, hand off, note and
 * mark them fixed. It never sees open reports and never accepts or declines: those stay human.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  CLAIM_TTL_MS, LIMITS, PLATFORMS, REPORT_TYPES, isPlatform, isReportType, toReporterView,
  type AgentToken, type CodeRef, type Member, type Project, type Report, type Task, type TaskNote,
} from './types.js';
import type { Deps, Req, Res } from './handler.js';
import { notify } from './notifications.js';

const json = (status: number, body: unknown): Res => ({ status, body });
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** 'https://github.com/Acme/Web.git' and 'git@github.com:acme/web' are the same repo. */
export function normaliseRepo(v: unknown): string | null {
  const s = str(v, LIMITS.repoMax);
  if (!s) return null;
  const r = s.toLowerCase()
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^[a-z+]+:\/\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  return /^[a-z0-9._~/-]+$/.test(r) ? r : null;
}

// ---- tokens, managed by the team from the dashboard ---------------------------------------

/** hst_<id>_<secret>. The id finds the record; the secret is checked against its hash. */
export async function tokenFromHeader(req: Req, deps: Deps): Promise<AgentToken | null> {
  const m = /^Bearer hst_([A-Za-z0-9-]{8,40})_([A-Za-z0-9_-]{20,80})$/.exec(req.headers['authorization'] ?? '');
  if (!m) return null;
  const t = await deps.store.getAgentToken(m[1]);
  if (!t || t.revoked_at) return null;
  const a = Buffer.from(hash(m[2])), b = Buffer.from(t.secret_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return t;
}

const publicToken = (t: AgentToken) => {
  const { secret_hash: _, ...rest } = t;
  return rest;
};

/** GET/POST /v1/agent-tokens, DELETE /v1/agent-tokens/:id. Any team member. */
export async function tokens(p: string[], me: Member, req: Req, deps: Deps, body: Record<string, unknown>): Promise<Res> {
  if (p.length === 1 && req.method === 'GET') {
    const all = (await deps.store.listAgentTokens()).filter((t) => !t.revoked_at);
    all.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return json(200, { tokens: all.map(publicToken) });
  }
  if (p.length === 1 && req.method === 'POST') {
    // No repo: the token is for a prompt, and binds to the repo that first connects with it.
    const repo = body.repo === undefined || body.repo === null || body.repo === '' ? null : normaliseRepo(body.repo);
    if (repo === null && body.repo) return json(400, { error: 'name the repo, for example github.com/acme/web' });
    const ids = Array.isArray(body.app_ids) ? body.app_ids.filter((x): x is string => typeof x === 'string') : [];
    for (const id of ids) if (!(await deps.store.getProject(id))) return json(400, { error: `no such app: ${id}` });
    const id = randomBytes(9).toString('base64url').replace(/_/g, '-');
    const secret = randomBytes(24).toString('base64url');
    const t: AgentToken = {
      id, secret_hash: hash(secret), repo, app_ids: [...new Set(ids)], created_by: me.email,
      created_at: new Date(deps.now()).toISOString(), last_used_at: null, revoked_at: null,
    };
    await deps.store.createAgentToken(t);
    deps.log('api.agent_token_created', { by: me.email, repo, apps: t.app_ids.length });
    // The only time the secret leaves the server.
    return json(201, { token: `hst_${id}_${secret}`, agent: publicToken(t) });
  }
  if (p.length === 2 && req.method === 'DELETE') {
    const t = await deps.store.getAgentToken(p[1]);
    if (!t || t.revoked_at) return json(404, { error: 'no such token' });
    await deps.store.updateAgentToken(t.id, { revoked_at: new Date(deps.now()).toISOString() });
    deps.log('api.agent_token_revoked', { by: me.email, repo: t.repo });
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
}

/** The repos connected to an app: where a brief for it can be routed. */
export async function reposFor(project_id: string, deps: Deps): Promise<string[]> {
  const ts = (await deps.store.listAgentTokens()).filter((t) => !t.revoked_at && t.repo && t.app_ids.includes(project_id));
  ts.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [...new Set(ts.map((t) => t.repo as string))];
}

// ---- briefs as an agent sees them ---------------------------------------------------------

const claimLive = (t: Task, now: number) => !!t.claim && now - Date.parse(t.claim.at) < CLAIM_TTL_MS;

/** A brief is for this repo if it was routed here, or routed nowhere yet. */
const visibleTo = (t: Task, token: AgentToken) => (t.repo ?? null) === null || t.repo === token.repo;

function summary(t: Task, p: Project, now: number) {
  return {
    id: t.id, app: { id: p.id, name: p.name, platform: p.platform },
    type: t.type, route: t.context.route, app_version: t.context.app_version,
    accepted_at: t.accepted_at, repo: t.repo ?? null,
    claimed_by: claimLive(t, now) ? t.claim!.repo : null,
    notes: (t.notes ?? []).length,
    // How many people this is for: the report and any merged into it.
    reporters: 1 + (t.also_reported?.length ?? 0),
  };
}

// ---- /v1/agent/* --------------------------------------------------------------------------

export async function agent(
  p: string[], req: Req, deps: Deps, body: Record<string, unknown>,
  prompt: (project: Project, t: Task) => string,
  createProject: (by: string, body: Record<string, unknown>) => Promise<Res>,
  toReporter: (project: Project, report_id: string, note: string, by: string) => Promise<Res>,
): Promise<Res> {
  const token = await tokenFromHeader(req, deps);
  if (!token) return json(401, { error: 'this agent token is not valid (revoked, or never issued). Run npx heresay connect again.' });
  const now = deps.now();
  const at = new Date(now).toISOString();
  if (!token.last_used_at || now - Date.parse(token.last_used_at) > 3600_000) {
    await deps.store.updateAgentToken(token.id, { last_used_at: at });
  }
  const apps = (await Promise.all(token.app_ids.map((id) => deps.store.getProject(id)))).filter((x): x is Project => !!x);

  if (p[0] === 'me' && req.method === 'GET') {
    return json(200, { repo: token.repo, version: deps.version, apps: apps.map(appView) });
  }
  if (p[0] === 'bind' && req.method === 'POST') {
    const repo = normaliseRepo(body.repo);
    if (!repo) return json(400, { error: 'name the repo, for example github.com/acme/web' });
    if (token.repo && token.repo !== repo) return json(409, { error: `this token belongs to ${token.repo}`, repo: token.repo });
    if (!token.repo) {
      await deps.store.updateAgentToken(token.id, { repo });
      deps.log('api.agent_token_bound', { repo, by: token.created_by });
    }
    return json(200, { repo, version: deps.version, apps: apps.map(appView) });
  }
  // Everything else needs to know which repo it is working in.
  if (!token.repo) return json(409, { error: 'this token isn\'t connected to a repo yet. Run npx heresay connect with it in the repo first.' });
  const repoName: string = token.repo;
  const me = `agent:${repoName}`;

  if (p[0] === 'apps') {
    if (p.length === 1 && req.method === 'GET') return json(200, { apps: apps.map(appView) });
    if (p.length === 1 && req.method === 'POST') {
      if (body.platform !== undefined && !isPlatform(body.platform)) {
        return json(400, { error: `platform must be one of ${PLATFORMS.join(', ')}` });
      }
      const res = await createProject(token.created_by, { ...body, allowed_origins: body.sites ?? body.allowed_origins });
      if (res.status !== 201) return res;
      const project = (res.body as { project: Project }).project;
      // An app created from a repo belongs to that repo's token from then on.
      await deps.store.updateAgentToken(token.id, { app_ids: [...token.app_ids, project.id] });
      deps.log('api.agent_app_created', { repo: repoName, project_id: project.id });
      return json(201, { app: appView(project) });
    }
    const app = apps.find((a) => a.id === p[1]);
    if (!app) return json(404, { error: 'this repo is not connected to that app' });
    if (p[2] === 'verify' && req.method === 'POST') {
      // What `heresay check` found in this repo: the file holding the app's key.
      const file = str(body.file, 300);
      if (!file) return json(400, { error: 'say which file has the key' });
      const code_found = { at, repo: repoName, file };
      await deps.store.updateProject(app.id, { code_found });
      deps.log('api.install_verified', { project_id: app.id, repo: repoName });
      return json(200, { code_found });
    }
    if (p[2] === 'check' && req.method === 'GET') {
      // Counts and screens only. Report text is untrusted, and an install check doesn't need it.
      const rs = await deps.store.listReports(app.id);
      const first = [...rs].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return json(200, {
        reports: rs.length,
        first: first ? { route: first.context.route, app_version: first.context.app_version, created_at: first.created_at } : null,
        framework: app.framework, framework_detected: !!app.framework_detected,
        sdk_seen: app.sdk_seen ?? null, code_found: app.code_found ?? null,
        installed: !!(app.sdk_seen || app.code_found),
      });
    }
    return json(404, { error: 'not found' });
  }

  if (p[0] === 'findings') return findings(p, req, deps, body, token, repoName, apps, now);

  if (p[0] !== 'briefs') return json(404, { error: 'not found' });

  if (p.length === 1 && req.method === 'GET') {
    const out = [];
    for (const app of apps) {
      for (const t of await deps.store.listTasks(app.id)) {
        const r = await deps.store.getReport(app.id, t.report_id);
        if (r?.status !== 'accepted' || !visibleTo(t, token)) continue;
        out.push(summary(t, app, now));
      }
    }
    out.sort((a, b) => Number(!!a.claimed_by && a.claimed_by !== repoName) - Number(!!b.claimed_by && b.claimed_by !== repoName)
      || a.accepted_at.localeCompare(b.accepted_at));
    return json(200, { repo: repoName, briefs: out });
  }

  // One brief. Found by id within this token's apps only.
  let found: { app: Project; task: Task } | null = null;
  for (const app of apps) {
    const t = await deps.store.getTask(app.id, p[1]);
    if (t) { found = { app, task: t }; break; }
  }
  if (!found || !visibleTo(found.task, token)) return json(404, { error: 'no such brief for this repo' });
  const { app } = found;
  const report = await deps.store.getReport(app.id, found.task.report_id);
  const done = report?.status !== 'accepted';

  if (p.length === 2 && req.method === 'GET') {
    const t = found.task;
    return json(200, {
      brief: { ...summary(t, app, now), status: report?.status ?? 'accepted', notes: t.notes ?? [], developer_note: t.note },
      prompt: prompt(app, t),
    });
  }
  if (req.method !== 'POST') return json(404, { error: 'not found' });
  if (done) return json(409, { error: `this brief is already ${report?.status}`, status: report?.status });

  const takenByOther = (t: Task) => claimLive(t, now) && t.claim!.repo !== repoName;
  const addNote = (t: Task, text: string, kind: TaskNote['kind']): Task =>
    ({ ...t, notes: [...(t.notes ?? []), { by: me, at, text, kind }] });

  if (p[2] === 'claim') {
    let refused = '';
    const t = await deps.store.updateTask(app.id, found.task.id, (cur) => {
      if (takenByOther(cur)) { refused = cur.claim!.repo; return cur; }
      return { ...cur, claim: { repo: repoName, at } };
    });
    if (refused) return json(409, { error: `already in progress in ${refused}`, claimed_by: refused });
    deps.log('api.brief_claimed', { repo: repoName, report_id: t!.id });
    return json(200, { brief: summary(t!, app, now) });
  }

  if (p[2] === 'notes') {
    const text = str(body.note, LIMITS.reasonMax);
    if (!text) return json(400, { error: 'write the note' });
    const t = await deps.store.updateTask(app.id, found.task.id, (cur) => {
      const next = addNote(cur, text, 'note');
      // Working on it keeps the claim fresh.
      return cur.claim?.repo === repoName ? { ...next, claim: { repo: repoName, at } } : next;
    });
    return json(200, { brief: summary(t!, app, now) });
  }

  if (p[2] === 'handoff') {
    const to = normaliseRepo(body.repo);
    const text = str(body.note, LIMITS.reasonMax);
    if (!text) return json(400, { error: 'say what you found, so the next agent starts from it' });
    const repos = await reposFor(app.id, deps);
    if (!to || !repos.includes(to)) {
      return json(400, { error: `hand off to a repo connected to ${app.name}: ${repos.join(', ') || 'none yet'}`, repos });
    }
    if (to === repoName) return json(400, { error: 'that is this repo' });
    let refused = '';
    const t = await deps.store.updateTask(app.id, found.task.id, (cur) => {
      if (takenByOther(cur)) { refused = cur.claim!.repo; return cur; }
      return { ...addNote(cur, `Handed to ${to}: ${text}`, 'handoff'), repo: to, claim: null };
    });
    if (refused) return json(409, { error: `in progress in ${refused}`, claimed_by: refused });
    deps.log('api.brief_handed_off', { from: repoName, to, report_id: t!.id });
    await notify('handoff', app, t!.id, deps);
    return json(200, { brief: summary(t!, app, now) });
  }

  if (p[2] === 'fixed') {
    // Required, like a decline reason: the reporter reads it.
    const note = str(body.note, LIMITS.reasonMax);
    if (!note) return json(400, { error: 'write a note for the person who reported it: what changed, in their words' });
    if (takenByOther(found.task)) return json(409, { error: `in progress in ${found.task.claim!.repo}` });
    const res = await toReporter(app, found.task.id, note, me);
    if (res.status === 200) {
      await deps.store.updateTask(app.id, found.task.id, (cur) => ({ ...addNote(cur, `Fixed: ${note}`, 'note'), claim: null }));
    }
    return res;
  }
  return json(404, { error: 'not found' });
}

const appView = (p: Project) => ({
  id: p.id, name: p.name, platform: p.platform, framework: p.framework, sign_in: p.sign_in ?? null,
  product_id: p.product_id ?? p.id,
  framework_detected: !!p.framework_detected, key: p.key, allowed_origins: p.allowed_origins,
});

// ---- findings: agents as a source -----------------------------------------------------------

/** Per repo: an agent can notice a lot in one session, but not flood the inbox. */
export const FINDING_LIMITS = [
  { limit: 30, windowMs: 3600_000 },
  { limit: 150, windowMs: 24 * 3600_000 },
] as const;

/** One repo's findings share a device id, so "the ones I filed" works like a reporter's own. */
export const agentDevice = (repo: string) => `agent_${hash(repo).slice(0, 32)}`;

const sameText = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim();

/** Paths relative to the repo, no "..", optional line numbers. Anything malformed is dropped. */
function parseFiles(v: unknown): CodeRef[] | null {
  if (!Array.isArray(v)) return null;
  const out: CodeRef[] = [];
  for (const f of v.slice(0, LIMITS.filesMax)) {
    const o = (typeof f === 'string' ? { path: f } : f) as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') continue;
    let path = str(o.path, LIMITS.pathMax);
    let line = typeof o.line === 'number' && Number.isInteger(o.line) && o.line > 0 ? o.line : null;
    if (!path) continue;
    const m = /^(.*?):(\d+)$/.exec(path);
    if (m && line === null) { path = m[1]!; line = Number(m[2]); }
    path = path.replace(/^\.\/+/, '').replace(/^\/+/, '');
    if (!path || path.split('/').includes('..')) continue;
    out.push({ path, line });
  }
  return out.length ? out : null;
}

/**
 * POST /v1/agent/findings: something a coding agent noticed while working (a bug, dead code, a
 * risk, an idea), filed in the inbox like any report. It waits for a person to accept it; only
 * then does it become a brief. GET /v1/agent/findings: what happened to this repo's findings.
 */
async function findings(p: string[], req: Req, deps: Deps, body: Record<string, unknown>,
  token: AgentToken, repoName: string, apps: Project[], now: number): Promise<Res> {
  const device = agentDevice(repoName);
  if (p.length === 1 && req.method === 'GET') {
    const out = [];
    for (const app of apps) {
      for (const r of await deps.store.listReportsForDevice(app.id, device)) out.push({ ...toReporterView(r), app: { id: app.id, name: app.name } });
    }
    out.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json(200, { repo: repoName, findings: out.slice(0, 100) });
  }
  if (p.length !== 1 || req.method !== 'POST') return json(404, { error: 'not found' });

  const want = str(body.app, 100);
  const app = want ? apps.find((a) => a.id === want || a.name.toLowerCase() === want.toLowerCase())
    : apps.length === 1 ? apps[0] : undefined;
  if (!app) {
    return json(400, { error: want ? `this repo is not connected to an app called "${want}"` : 'say which app it is for', apps: apps.map(appView) });
  }
  // The type, never a priority: the inbox orders by type for agents and people alike.
  if (!isReportType(body.type)) return json(400, { error: `type must be one of ${REPORT_TYPES.join(', ')}` });
  const text = str(body.text, LIMITS.textMax);
  if (!text) return json(400, { error: 'say what you found, in text' });
  const details = str(body.details, LIMITS.detailsMax);
  const files = parseFiles(body.files);

  // The same finding again from this repo, still open: the one already there, not a second.
  const open = (await deps.store.listReportsForDevice(app.id, device)).find((r) => r.status === 'open' && sameText(r.text, text));
  if (open) return json(200, { finding: { ...toReporterView(open), app: { id: app.id, name: app.name } }, duplicate: true });

  for (const l of FINDING_LIMITS) {
    const start = Math.floor(now / l.windowMs) * l.windowMs;
    if (!(await deps.store.hit(`finding:${l.windowMs}:${token.id}:${start}`, l.limit, start + l.windowMs))) {
      return json(429, { error: 'that is a lot of findings from one repo in a short time; try again later' });
    }
  }
  const at = new Date(now).toISOString();
  const report: Report = {
    id: `r_${randomBytes(12).toString('base64url')}`, project_id: app.id, device_id: device, type: body.type, text,
    source: 'agent', from_repo: repoName, via: str(body.agent, 60), details, files,
    context: {
      route: null, app_version: null, platform: 'agent', os: null, browser: null,
      user_id: null, user_label: null, user_email: null, framework: null,
    },
    reporter: null, trail: null,
    status: 'open', decline_reason: null, fix_note: null, created_at: at, updated_at: at, triaged_by: null,
  };
  await deps.store.createReport(report);
  deps.log('api.finding_filed', { project_id: app.id, report_id: report.id, repo: repoName });
  await notify('new_report', app, report.id, deps);
  return json(201, { finding: { ...toReporterView(report), app: { id: app.id, name: app.name } }, duplicate: false });
}
