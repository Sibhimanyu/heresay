/**
 * /v1/mcp: Heresay as an MCP server for chat apps (ChatGPT, Claude and others), so ideas that
 * come up in a conversation reach the team's inbox with the conversation's context.
 *
 * A team member connects their chat app with their own sign-in (oauth.ts). Then the assistant
 * can list the apps, send a request as them, and say what happened to the ones they sent. It
 * cannot read anyone else's reports, accept, decline or fix anything, and a request it sends
 * waits in the inbox like any report: an agent sees it only after a person accepts it.
 *
 * Streamable HTTP, stateless: every POST is one JSON-RPC message (or a batch) answered with JSON.
 * No server-to-client stream, so GET is refused.
 */
import { createHash } from 'node:crypto';
import type { Deps, Req, Res } from './handler.js';
import { OPEN_CORS, baseUrl, chatCaller, signInFirst } from './oauth.js';
import { notify } from './notifications.js';
import { withdraw } from './withdraw.js';
import { LIMITS, REPORT_TYPES, isReportType, type ChatDocument, type Member, type Project, type Report } from './types.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const json = (status: number, body: unknown, headers?: Record<string, string>): Res =>
  ({ status, body, headers: { ...OPEN_CORS, ...headers } });
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Requests from one member's chat apps: plenty for ideation, not a flood. */
export const CHAT_LIMITS = [
  { limit: 60, windowMs: 3600_000 },
  { limit: 300, windowMs: 24 * 3600_000 },
] as const;

// Descriptive, not prescriptive: chat apps flag tool text that tells the model when to ask for
// approval or what counts as sensitive ("Suspicious Instruction"). Their own rules cover that.
const INSTRUCTIONS = [
  'Heresay is this team\'s inbox for what should change in their apps: bugs, confusing parts, improvements and ideas.',
  'Sending takes two steps. draft_request prepares one and returns a preview (the app, the type, the text, and the other',
  'apps); nothing is sent. send_draft sends a draft, to the app in the preview or to another one. `text` is the request as',
  'a teammate would read it; `details` is what the conversation worked out (why it matters, what was considered or ruled',
  'out, examples, constraints, open questions); both may be Markdown. `document` attaches a Markdown (.md) file, its full',
  'contents as text (a spec, a research handoff, a summary of the whole conversation), up to 100,000 characters. A sent request stays open until someone on the team accepts it; sending',
  'does not start any work. my_requests says what happened to the ones this member sent.',
].join(' ');

/** How long a draft waits to be sent. */
const DRAFT_TTL_MS = 2 * 3600_000;

const TOOLS = [
  {
    name: 'list_apps',
    title: 'List Heresay apps',
    description: 'The apps on this Heresay, with their ids and platforms. Use to find which app a request is for.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'draft_request',
    title: 'Draft a Heresay request',
    description: 'Prepares a bug, a confusing part, an improvement or an idea for one app\'s Heresay inbox and returns a preview: '
      + 'the app it would go to, its type and text, and the other apps. Nothing is sent. Without an app it returns the list of apps. '
      + 'A Markdown (.md) file can be attached with `document` (its full contents).',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'The app\'s id or name, from list_apps, when the conversation names it' },
        type: { type: 'string', enum: [...REPORT_TYPES], description: 'broken: doesn\'t work. confusing: works, but people can\'t tell how. improvement: works, could be better. idea: doesn\'t exist yet.' },
        text: { type: 'string', maxLength: LIMITS.textMax, description: 'The request in a few plain sentences, as a teammate would read it.' },
        details: { type: 'string', maxLength: LIMITS.detailsMax, description: 'Context from the conversation: why, what was considered or ruled out, examples, constraints, open questions. Markdown.' },
        document: { type: 'string', maxLength: LIMITS.documentMax, description: 'Attach a Markdown (.md) file to the request: the file\'s full contents as text, up to 100,000 characters (about 15,000 words). For a spec, a research handoff, or a write-up of the whole conversation. Optional.' },
        document_title: { type: 'string', maxLength: LIMITS.documentTitleMax, description: 'The attached file\'s name or title, e.g. "RasanAI_Creative_Research_Handoff.md".' },
      },
      required: ['type', 'text'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'send_draft',
    title: 'Send a Heresay draft',
    description: 'Sends a draft from draft_request to the inbox, as the signed-in team member. `app` sends it to a different app '
      + 'than the preview named. It stays open until someone on the team accepts it.',
    inputSchema: {
      type: 'object',
      properties: {
        draft_id: { type: 'string', description: 'From draft_request' },
        app: { type: 'string', description: 'Another app\'s id or name, to send it there instead' },
      },
      required: ['draft_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'withdraw_request',
    title: 'Take back a Heresay request',
    description: 'Withdraws a request this team member sent, while it is still open. It isn\'t deleted: the team sees it under Withdrawn, with the reason. Accepted requests can\'t be withdrawn.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The request id, from my_requests' },
        reason: { type: 'string', maxLength: LIMITS.reasonMax, description: 'Why, in a sentence. Optional.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'my_requests',
    title: 'My Heresay requests',
    description: 'What happened to the requests this person sent from chat apps: open, accepted, fixed (with the note) or declined (with the reason).',
    inputSchema: {
      type: 'object',
      properties: { app: { type: 'string', description: 'Only this app (id or name). Leave out for all.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

/** One member's chat requests share a device id, so "mine" works the same way it does in apps. */
export const chatDevice = (email: string) => `chat_${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)}`;

export async function mcp(req: Req, deps: Deps): Promise<Res> {
  if (req.method === 'OPTIONS') return json(204, null);
  if (req.method !== 'POST') return json(405, { error: 'POST JSON-RPC messages to this address' }, { allow: 'POST, OPTIONS' });
  const who = await chatCaller(req, deps);
  if (!who) return signInFirst(req, deps);

  let body = req.body;
  if (body instanceof Uint8Array) body = Buffer.from(body).toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return json(400, rpcError(null, -32700, 'Parse error')); }
  }
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as unknown[];
  const out: unknown[] = [];
  for (const m of messages) {
    const r = await one(m, who.member, String(who.grant.data.client_name ?? 'a chat app'), req, deps);
    if (r) out.push(r);
  }
  // Only notifications: nothing to say.
  if (!out.length) return json(202, null);
  return json(200, batch ? out : out[0]);
}

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });

async function one(m: unknown, member: Member, via: string, req: Req, deps: Deps): Promise<unknown | null> {
  if (!m || typeof m !== 'object') return rpcError(null, -32600, 'Invalid request');
  const msg = m as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
  const isNotification = msg.id === undefined;
  if (typeof msg.method !== 'string') return isNotification ? null : rpcError(msg.id, -32600, 'Invalid request');
  if (isNotification) return null;
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'heresay', title: 'Heresay', version: deps.version },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return rpcResult(msg.id, {});
    case 'tools/list': return rpcResult(msg.id, { tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        if (name === 'list_apps') return rpcResult(msg.id, await listApps(deps));
        // send_request is what older bridges call; it drafts too, so nothing is sent unseen.
        if (name === 'draft_request' || name === 'send_request') return rpcResult(msg.id, await draftRequest(args, member, via, deps));
        if (name === 'send_draft') return rpcResult(msg.id, await sendDraft(args, member, req, deps));
        if (name === 'withdraw_request') return rpcResult(msg.id, await withdrawRequest(args, member, deps));
        if (name === 'my_requests') return rpcResult(msg.id, await myRequests(args, member, req, deps));
        return rpcError(msg.id, -32602, `Unknown tool: ${String(name)}`);
      } catch (e) {
        if (e instanceof ToolError) return rpcResult(msg.id, { isError: true, content: [{ type: 'text', text: e.message }] });
        throw e;
      }
    }
    default: return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

class ToolError extends Error {}

const result = (text: string, structured: Record<string, unknown>) =>
  ({ content: [{ type: 'text', text }], structuredContent: structured });

async function listApps(deps: Deps) {
  const ps = (await deps.store.listProjects()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const apps = ps.map((p) => ({ id: p.id, name: p.name, platform: p.platform, product: p.product_id ?? p.id }));
  return result(apps.length ? apps.map((a) => `${a.name} (${a.platform}): ${a.id}`).join('\n') : 'No apps on this Heresay yet.', { apps });
}

/** By id, or by name; a name shared by several platforms of one product picks the first. */
async function findApp(v: unknown, deps: Deps): Promise<Project> {
  const want = str(v, 100);
  if (!want) throw new ToolError('Say which app: its id or name from list_apps.');
  const ps = (await deps.store.listProjects()).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const hit = ps.find((p) => p.id === want) ?? ps.find((p) => p.name.toLowerCase() === want.toLowerCase());
  if (!hit) throw new ToolError(`No app called "${want}". The apps are: ${ps.map((p) => p.name).join(', ') || 'none yet'}.`);
  return hit;
}

const dashboardLink = (req: Req, deps: Deps, p: Project) => `${baseUrl(req, deps)}/app/#/apps/${p.id}`;

const appNames = (ps: Project[]) => ps.map((p) => `${p.name} (${p.platform})`).join(', ');

/** A preview, nothing sent: which app, what type, the text, and where else it could go. */
async function draftRequest(a: Record<string, unknown>, member: Member, via: string, deps: Deps) {
  if (!isReportType(a.type)) throw new ToolError(`type must be one of ${REPORT_TYPES.join(', ')}.`);
  const text = str(a.text, LIMITS.textMax);
  if (!text) throw new ToolError('Say what the request is, in text.');
  const details = str(a.details, LIMITS.detailsMax);
  // Refused rather than cut, so a long write-up isn't silently missing its end.
  if (typeof a.document === 'string' && a.document.length > LIMITS.documentMax) {
    throw new ToolError(`The document is ${a.document.length} characters; the limit is ${LIMITS.documentMax}. Shorten it or split it across requests.`);
  }
  const markdown = typeof a.document === 'string' && a.document.trim() ? a.document.replace(/\r\n/g, '\n').trim() : null;
  const document = markdown ? { title: str(a.document_title, LIMITS.documentTitleMax), markdown } : null;
  const all = (await deps.store.listProjects()).sort((x, y) => x.created_at.localeCompare(y.created_at));
  if (!str(a.app, 100)) {
    return result(`No app named, so no draft yet. The apps on this Heresay: ${appNames(all) || 'none yet'}. Which one is it for?`,
      { draft: null, apps: all.map((p) => ({ id: p.id, name: p.name, platform: p.platform })) });
  }
  const project = await findApp(a.app, deps);
  const id = createHash('sha256').update(`${member.email}${deps.now()}${Math.random()}`).digest('hex').slice(0, 24);
  await deps.store.putAuth({
    kind: 'draft', id, expires_at: new Date(deps.now() + DRAFT_TTL_MS).toISOString(),
    data: { email: member.email, project_id: project.id, type: a.type, text, details, document, via },
  });
  const others = all.filter((p) => p.id !== project.id);
  return result([
    `Draft, not sent yet. App: ${project.name} (${project.platform}). Type: ${a.type}.`,
    `Text: ${text}`,
    details ? `Details: ${details}` : null,
    document ? `Attached document: ${document.title ? `"${document.title}", ` : ''}${document.markdown.length} characters of Markdown.` : null,
    others.length ? `Other apps it could go to instead: ${appNames(others)}.` : null,
    `send_draft with draft_id ${id} sends it${others.length ? ' (with app set to send it elsewhere)' : ''}. Drafts last two hours.`,
  ].filter(Boolean).join('\n'), {
    draft_id: id, sent: false, app: project.name, type: a.type, text, details,
    document: document ? { title: document.title, characters: document.markdown.length } : null,
    other_apps: others.map((p) => ({ id: p.id, name: p.name, platform: p.platform })),
  });
}

async function sendDraft(a: Record<string, unknown>, member: Member, req: Req, deps: Deps) {
  const id = str(a.draft_id, 64);
  const d = id ? await deps.store.getAuth('draft', id) : null;
  if (!d || String(d.data.email).toLowerCase() !== member.email.toLowerCase() || Date.parse(d.expires_at ?? '') < deps.now()) {
    throw new ToolError('That draft doesn\'t exist, has expired or was already sent. Make a new one with draft_request.');
  }
  const project = a.app ? await findApp(a.app, deps) : await deps.store.getProject(String(d.data.project_id));
  if (!project) throw new ToolError('The draft\'s app was deleted. Name another app.');
  // Once only, however many times it's called.
  if (!(await deps.store.takeAuth('draft', id!))) throw new ToolError('That draft was already sent.');
  return createChatReport(project, d.data.type as Report['type'], String(d.data.text), (d.data.details as string | null) ?? null,
    (d.data.document as ChatDocument | null) ?? null, member, String(d.data.via ?? 'a chat app'), req, deps);
}

async function createChatReport(project: Project, type: Report['type'], text: string, details: string | null,
  document: ChatDocument | null, member: Member, via: string, req: Req, deps: Deps) {
  const now = deps.now();
  for (const l of CHAT_LIMITS) {
    const start = Math.floor(now / l.windowMs) * l.windowMs;
    if (!(await deps.store.hit(`chat:${l.windowMs}:${member.email.toLowerCase()}:${start}`, l.limit, start + l.windowMs))) {
      throw new ToolError('That\'s a lot of requests in a short time. Try again later.');
    }
  }
  const at = new Date(now).toISOString();
  const report: Report = {
    id: `r_${createHash('sha256').update(`${member.email}${now}${Math.random()}`).digest('base64url').slice(0, 16)}`,
    project_id: project.id, device_id: chatDevice(member.email), type, text,
    source: 'chat', from_member: member.email, via: str(via, 80), details, document,
    context: {
      route: null, app_version: null, platform: 'chat', os: null, browser: null,
      user_id: null, user_label: null, user_email: null, framework: null,
    },
    reporter: null, trail: null,
    status: 'open', decline_reason: null, fix_note: null, created_at: at, updated_at: at, triaged_by: null,
  };
  await deps.store.createReport(report);
  deps.log('chat.request_sent', { project_id: project.id, report_id: report.id, by: member.email, via });
  await notify('new_report', project, report.id, deps);
  const link = dashboardLink(req, deps, project);
  return result(
    `Sent to ${project.name} as ${report.type}. It waits in the inbox until someone on the team accepts it: ${link}`,
    { id: report.id, app: project.name, type: report.type, status: 'open', link },
  );
}

async function myRequests(a: Record<string, unknown>, member: Member, req: Req, deps: Deps) {
  const ps = a.app ? [await findApp(a.app, deps)] : await deps.store.listProjects();
  const device = chatDevice(member.email);
  const rows: Record<string, unknown>[] = [];
  for (const p of ps) {
    for (const r of await deps.store.listReportsForDevice(p.id, device)) {
      rows.push({
        id: r.id, app: p.name, type: r.type, text: r.text, status: r.status,
        decline_reason: r.decline_reason, fix_note: r.fix_note ?? null, sent_at: r.created_at, link: dashboardLink(req, deps, p),
      });
    }
  }
  rows.sort((x, y) => String(y.sent_at).localeCompare(String(x.sent_at)));
  const line = (r: Record<string, unknown>) => `- ${r.id} · ${r.app} · ${r.type} · ${r.status}${r.status === 'declined' && r.decline_reason ? ` (why: ${r.decline_reason})` : ''}`
    + `${r.status === 'fixed' && r.fix_note ? ` (${r.fix_note})` : ''}: ${String(r.text).slice(0, 140)}`;
  return result(rows.length ? rows.slice(0, 50).map(line).join('\n') : 'Nothing sent from a chat app yet.', { requests: rows.slice(0, 50) });
}

/** Find one of this member's requests across the apps and take it back. */
async function withdrawRequest(a: Record<string, unknown>, member: Member, deps: Deps) {
  const id = str(a.id, 64);
  if (!id) throw new ToolError('Say which request: its id, from my_requests.');
  const device = chatDevice(member.email);
  for (const p of await deps.store.listProjects()) {
    const r = await deps.store.getReport(p.id, id);
    if (!r) continue;
    const res = await withdraw(p, id, { kind: 'member', by: member.email }, a.reason, (d) => d === device, deps);
    if (res.status !== 200) throw new ToolError(String((res.body as { error?: string }).error ?? 'Couldn\'t withdraw it.'));
    return result(`Withdrawn from ${p.name}. It stays on the team's dashboard under Withdrawn${a.reason ? ', with your reason' : ''}.`, { id, app: p.name, status: 'withdrawn' });
  }
  throw new ToolError('No request with that id was sent by you.');
}
