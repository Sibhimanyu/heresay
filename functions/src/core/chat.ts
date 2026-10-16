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
import { LIMITS, REPORT_TYPES, isReportType, type Member, type Project, type Report } from './types.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const json = (status: number, body: unknown, headers?: Record<string, string>): Res =>
  ({ status, body, headers: { ...OPEN_CORS, ...headers } });
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Requests from one member's chat apps: plenty for ideation, not a flood. */
export const CHAT_LIMITS = [
  { limit: 60, windowMs: 3600_000 },
  { limit: 300, windowMs: 24 * 3600_000 },
] as const;

const INSTRUCTIONS = [
  'Heresay is this team\'s inbox for what should change in their apps: bugs, confusing parts, improvements and ideas.',
  'When the person says to send, save, log or file something to Heresay (or asks you to put an idea "in Heresay"), use send_request.',
  'Write `text` as the request itself, plainly, as a teammate would read it. Put what the conversation worked out in `details`:',
  'why it matters, what was considered or ruled out, examples, constraints, open questions. Never put secrets, passwords or',
  'personal data about other people in either. If it isn\'t clear which app, call list_apps and ask.',
  'Confirm with the person before sending if they didn\'t clearly ask to send. Requests wait for a person on the team to accept',
  'them; sending does not start any work. my_requests says what happened to the ones they sent.',
].join(' ');

const TOOLS = [
  {
    name: 'list_apps',
    title: 'List Heresay apps',
    description: 'The apps on this Heresay, with their ids and platforms. Use to find which app a request is for.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'send_request',
    title: 'Send to Heresay',
    description: 'Send a bug, a confusing part, an improvement or an idea to one app\'s Heresay inbox, as the signed-in team member, '
      + 'with the context from this conversation. It waits for someone on the team to accept it. Ask the person first unless they asked you to send it.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'The app\'s id or name, from list_apps' },
        type: { type: 'string', enum: [...REPORT_TYPES], description: 'broken: doesn\'t work. confusing: works, but people can\'t tell how. improvement: works, could be better. idea: doesn\'t exist yet.' },
        text: { type: 'string', maxLength: LIMITS.textMax, description: 'The request in a few plain sentences, as a teammate would read it.' },
        details: { type: 'string', maxLength: LIMITS.detailsMax, description: 'Context from the conversation: why, what was considered or ruled out, examples, constraints, open questions.' },
      },
      required: ['app', 'type', 'text'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
        if (name === 'send_request') return rpcResult(msg.id, await sendRequest(args, member, via, req, deps));
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

async function sendRequest(a: Record<string, unknown>, member: Member, via: string, req: Req, deps: Deps) {
  const project = await findApp(a.app, deps);
  if (!isReportType(a.type)) throw new ToolError(`type must be one of ${REPORT_TYPES.join(', ')}.`);
  const text = str(a.text, LIMITS.textMax);
  if (!text) throw new ToolError('Say what the request is, in text.');
  const details = str(a.details, LIMITS.detailsMax);
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
    project_id: project.id, device_id: chatDevice(member.email), type: a.type, text,
    source: 'chat', from_member: member.email, via: str(via, 80), details,
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
  const line = (r: Record<string, unknown>) => `- ${r.app} · ${r.type} · ${r.status}${r.status === 'declined' && r.decline_reason ? ` (why: ${r.decline_reason})` : ''}`
    + `${r.status === 'fixed' && r.fix_note ? ` (${r.fix_note})` : ''}: ${String(r.text).slice(0, 140)}`;
  return result(rows.length ? rows.slice(0, 50).map(line).join('\n') : 'Nothing sent from a chat app yet.', { requests: rows.slice(0, 50) });
}
