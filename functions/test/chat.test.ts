// Chat apps (ChatGPT and other MCP clients): connecting with a member's own sign-in, then
// sending requests with the conversation's context. They wait in the inbox like any report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { MemoryStore } from '../src/core/store.js';
import { handle, type Deps, type Req } from '../src/core/handler.js';
import type { Project } from '../src/core/types.js';

const BASE = 'https://heresay.example';
const CHATGPT = 'https://chatgpt.com/connector_platform_oauth_redirect';

function setup() {
  const store = new MemoryStore();
  let t = Date.parse('2026-10-16T10:00:00Z');
  const deps: Deps = {
    store,
    verifyIdToken: async (tok) => {
      const [kind, name] = tok.split(':');
      return kind === 'uid' ? { uid: name!, email: `${name}@example.com`, emailVerified: true } : null;
    },
    now: () => t, log: () => {}, version: '0.0.0-test', selfOrigins: [BASE],
  };
  store.instance = {
    created_at: '2026-10-16T09:00:00Z',
    members: [
      { email: 'alice@example.com', role: 'owner', added_at: '2026-10-16T09:00:00Z', added_by: null },
      { email: 'bob@example.com', role: 'member', added_at: '2026-10-16T09:00:00Z', added_by: 'alice@example.com' },
    ],
  };
  const call = (r: Partial<Req>) => handle({ method: 'GET', path: '/', query: {}, body: undefined, headers: { host: 'heresay.example', 'x-forwarded-proto': 'https' }, ip: '1.2.3.4', ...r }, deps);
  const as = (name: string) => ({ authorization: `Bearer uid:${name}` });
  return { store, call, as, tick: (ms: number) => { t += ms; } };
}

/** What ChatGPT does: discover, register, send the person to authorize, exchange the code. */
async function connect(s: ReturnType<typeof setup>, who = 'alice') {
  const prm = await s.call({ path: '/.well-known/oauth-protected-resource/v1/mcp' });
  assert.equal((prm.body as { resource: string }).resource, `${BASE}/v1/mcp`);
  const as = (await s.call({ path: '/.well-known/oauth-authorization-server' })).body as Record<string, string>;
  assert.equal(as.issuer, BASE);
  const reg = await s.call({ method: 'POST', path: '/v1/oauth/register', body: { client_name: 'ChatGPT', redirect_uris: [CHATGPT] } });
  assert.equal(reg.status, 201);
  const client_id = (reg.body as { client_id: string }).client_id;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = { response_type: 'code', client_id, redirect_uri: CHATGPT, state: 'st8', code_challenge: challenge, code_challenge_method: 'S256', scope: 'heresay.requests' };
  const auth = await s.call({ path: '/v1/oauth/authorize', query: q });
  assert.equal(auth.status, 302);
  const to = auth.headers!.location!;
  assert.ok(to.startsWith(`${BASE}/app/#/authorize?`), 'to the dashboard, to say yes signed in');
  const ask = await s.call({ path: '/v1/oauth/ask', query: q, headers: s.as(who) });
  assert.deepEqual(ask.body, { client_name: 'ChatGPT', redirect_host: 'chatgpt.com' });
  const ok = await s.call({ method: 'POST', path: '/v1/oauth/approve', headers: s.as(who), body: { ...q, allow: true } });
  const back = new URL((ok.body as { redirect: string }).redirect);
  assert.equal(back.origin + back.pathname, CHATGPT);
  assert.equal(back.searchParams.get('state'), 'st8');
  const code = back.searchParams.get('code')!;
  const tok = await s.call({
    method: 'POST', path: '/v1/oauth/token',
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CHATGPT, client_id, code_verifier: verifier }).toString(),
  });
  assert.equal(tok.status, 200, JSON.stringify(tok.body));
  const t = tok.body as { access_token: string; refresh_token: string; expires_in: number };
  return { ...t, client_id, code, verifier };
}

async function addApp(s: ReturnType<typeof setup>, name = 'Greenroom') {
  const r = await s.call({ method: 'POST', path: '/v1/projects', headers: s.as('alice'), body: { name } });
  return (r.body as { project: Project }).project;
}

const rpc = (s: ReturnType<typeof setup>, token: string | null, method: string, params?: unknown, id: unknown = 1) =>
  s.call({ method: 'POST', path: '/v1/mcp', headers: token ? { authorization: `Bearer ${token}` } : {}, body: { jsonrpc: '2.0', id, method, params } });

/** Draft, then send: what a chat app does once the person has seen the preview. */
async function send(s: ReturnType<typeof setup>, token: string, args: Record<string, unknown>) {
  const draft = ((await rpc(s, token, 'tools/call', { name: 'draft_request', arguments: args })).body as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: { draft_id: string } } }).result;
  if (draft.isError || !draft.structuredContent?.draft_id) return draft;
  return ((await rpc(s, token, 'tools/call', { name: 'send_draft', arguments: { draft_id: draft.structuredContent.draft_id } })).body as { result: { isError?: boolean; content: { text: string }[]; structuredContent: { id: string; status: string } } }).result;
}

test('a chat app with no sign-in is told where to sign in', async () => {
  const s = setup();
  const r = await rpc(s, null, 'initialize', { protocolVersion: '2025-06-18' });
  assert.equal(r.status, 401);
  assert.match(r.headers!['www-authenticate']!, new RegExp(`resource_metadata="${BASE}/\\.well-known/oauth-protected-resource/v1/mcp"`));
  assert.equal((await rpc(s, 'hat_' + 'a'.repeat(24) + '_' + 'x'.repeat(30), 'tools/list')).status, 401);
});

test('connect, then send an idea with the conversation\'s context: it waits in the inbox as from the member', async () => {
  const s = setup();
  const app = await addApp(s);
  const { access_token } = await connect(s, 'bob');
  const init = (await rpc(s, access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '1' } })).body as { result: { protocolVersion: string; instructions: string } };
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.match(init.result.instructions, /draft_request prepares one and returns a preview/);
  assert.equal((await s.call({ method: 'POST', path: '/v1/mcp', headers: { authorization: `Bearer ${access_token}` }, body: { jsonrpc: '2.0', method: 'notifications/initialized' } })).status, 202);
  const tools = ((await rpc(s, access_token, 'tools/list')).body as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.deepEqual(tools, ['list_apps', 'draft_request', 'send_draft', 'my_requests'], 'nothing that reads others\' reports, accepts, declines or fixes');

  const raw = await rpc(s, access_token, 'tools/call', { name: 'list_apps', arguments: {} });
  const listed = (raw.body as { result: { structuredContent: { apps: { name: string }[] } } }).result;
  assert.deepEqual(listed.structuredContent.apps.map((a) => a.name), ['Greenroom']);

  const sent = { result: await send(s, access_token, {
    app: 'greenroom', type: 'idea', text: 'Show a countdown to the next meeting in the menu bar.',
    details: 'Came up while planning the week. Considered a notification instead, ruled out: too noisy. Should respect Focus.',
  }) as { content: { text: string }[]; structuredContent: { id: string; status: string } } };
  assert.equal(sent.result.structuredContent.status, 'open');
  assert.match(sent.result.content[0]!.text, /waits in the inbox until someone on the team accepts it/);
  const r = s.store.reports.get(sent.result.structuredContent.id)!;
  assert.equal(r.project_id, app.id);
  assert.equal(r.source, 'chat');
  assert.equal(r.from_member, 'bob@example.com');
  assert.equal(r.via, 'ChatGPT');
  assert.match(r.details!, /ruled out: too noisy/);
  assert.equal(r.status, 'open');

  // Not a task, so no agent sees it, until a person accepts it.
  assert.equal(s.store.tasks.size, 0);
  const base = `/v1/projects/${app.id}/reports/${r.id}`;
  assert.equal((await s.call({ path: `${base}/prompt`, headers: s.as('alice') })).status, 404);
  await s.call({ method: 'POST', path: `${base}/accept`, headers: s.as('alice') });
  const prompt = ((await s.call({ path: `${base}/prompt`, headers: s.as('alice') })).body as { prompt: string }).prompt;
  assert.match(prompt, /A member of the Greenroom team \(bob@example\.com\) sent this from a conversation in ChatGPT/);
  assert.match(prompt, /Context from the conversation:\nCame up while planning the week/);
  assert.ok(prompt.indexOf('ruled out') < prompt.lastIndexOf('"""'), 'the context is fenced like report text');
  assert.equal(prompt.split('"""').length, 3);

  const mine = ((await rpc(s, access_token, 'tools/call', { name: 'my_requests', arguments: {} })).body as { result: { structuredContent: { requests: { status: string }[] } } }).result;
  assert.deepEqual(mine.structuredContent.requests.map((x) => x.status), ['accepted']);
  // Alice's chat sees only Alice's requests.
  const alice = await connect(s, 'alice');
  const hers = ((await rpc(s, alice.access_token, 'tools/call', { name: 'my_requests', arguments: {} })).body as { result: { structuredContent: { requests: unknown[] } } }).result;
  assert.deepEqual(hers.structuredContent.requests, []);
});

test('bad arguments come back as tool errors the assistant can read', async () => {
  const s = setup();
  await addApp(s);
  const { access_token } = await connect(s);
  const call = async (args: Record<string, unknown>) => ((await rpc(s, access_token, 'tools/call', { name: 'draft_request', arguments: args })).body as { result: { isError?: boolean; content: { text: string }[] } }).result;
  assert.match((await call({ app: 'Nope', type: 'idea', text: 'x' })).content[0]!.text, /No app called "Nope". The apps are: Greenroom/);
  assert.match((await call({ app: 'Greenroom', type: 'urgent', text: 'x' })).content[0]!.text, /type must be one of broken, confusing, improvement, idea/, 'never a priority');
  assert.equal((await call({ app: 'Greenroom', type: 'idea', text: '  ' })).isError, true);
  assert.equal(((await rpc(s, access_token, 'nope/method')).body as { error: { code: number } }).error.code, -32601);
});

test('codes are used once, need the right verifier, and expire', async () => {
  const s = setup();
  const c = await connect(s);
  const again = await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'authorization_code', code: c.code, redirect_uri: CHATGPT, client_id: c.client_id, code_verifier: c.verifier } });
  assert.equal((again.body as { error: string }).error, 'invalid_grant', 'a code works once');

  const reg = await s.call({ method: 'POST', path: '/v1/oauth/register', body: { redirect_uris: [CHATGPT] } });
  const client_id = (reg.body as { client_id: string }).client_id;
  const challenge = createHash('sha256').update('v'.repeat(43)).digest('base64url');
  const q = { response_type: 'code', client_id, redirect_uri: CHATGPT, code_challenge: challenge, code_challenge_method: 'S256' };
  const code = new URL(((await s.call({ method: 'POST', path: '/v1/oauth/approve', headers: s.as('alice'), body: { ...q, allow: true } })).body as { redirect: string }).redirect).searchParams.get('code')!;
  const wrong = await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'authorization_code', code, redirect_uri: CHATGPT, client_id, code_verifier: 'w'.repeat(43) } });
  assert.equal((wrong.body as { error: string }).error, 'invalid_grant', 'PKCE');

  const code2 = new URL(((await s.call({ method: 'POST', path: '/v1/oauth/approve', headers: s.as('alice'), body: { ...q, allow: true } })).body as { redirect: string }).redirect).searchParams.get('code')!;
  s.tick(11 * 60_000);
  const late = await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'authorization_code', code: code2, redirect_uri: CHATGPT, client_id, code_verifier: 'v'.repeat(43) } });
  assert.equal((late.body as { error: string }).error, 'invalid_grant', 'ten minutes');
});

test('authorizing refuses what it shouldn\'t redirect to, and only team members can say yes', async () => {
  const s = setup();
  const reg = await s.call({ method: 'POST', path: '/v1/oauth/register', body: { redirect_uris: [CHATGPT] } });
  const client_id = (reg.body as { client_id: string }).client_id;
  const challenge = createHash('sha256').update('v'.repeat(43)).digest('base64url');
  const q = { response_type: 'code', client_id, redirect_uri: CHATGPT, code_challenge: challenge, code_challenge_method: 'S256' };
  assert.equal((await s.call({ path: '/v1/oauth/authorize', query: { ...q, redirect_uri: 'https://evil.example/cb' } })).status, 400, 'not a registered redirect');
  assert.equal((await s.call({ path: '/v1/oauth/authorize', query: { ...q, code_challenge_method: 'plain' } })).status, 400, 'S256 only');
  assert.equal((await s.call({ method: 'POST', path: '/v1/oauth/register', body: { redirect_uris: ['http://evil.example/cb'] } })).status, 400, 'https only');
  assert.equal((await s.call({ method: 'POST', path: '/v1/oauth/approve', headers: s.as('mallory'), body: { ...q, allow: true } })).status, 403, 'not on the team');
  const no = await s.call({ method: 'POST', path: '/v1/oauth/approve', headers: s.as('alice'), body: { ...q, state: 's', allow: false } });
  assert.match((no.body as { redirect: string }).redirect, /error=access_denied&state=s/);
});

test('refresh tokens rotate; revoking a connection or leaving the team ends it at once', async () => {
  const s = setup();
  const c = await connect(s, 'bob');
  const r1 = await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id } });
  assert.equal(r1.status, 200);
  const next = r1.body as { access_token: string; refresh_token: string };
  const old = await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'refresh_token', refresh_token: c.refresh_token } });
  assert.equal((old.body as { error: string }).error, 'invalid_grant', 'the old refresh token is spent');
  assert.equal((await rpc(s, next.access_token, 'ping')).status, 200);

  // The dashboard lists it; Bob sees his own, Alice (owner) sees everyone's.
  const listed = (await s.call({ path: '/v1/chat-connections', headers: s.as('bob') })).body as { connections: { id: string; client_name: string; email: string }[] };
  assert.deepEqual(listed.connections.map((x) => [x.client_name, x.email]), [['ChatGPT', 'bob@example.com']]);
  const id = listed.connections[0]!.id;
  await connect(s, 'alice');
  assert.equal(((await s.call({ path: '/v1/chat-connections', headers: s.as('bob') })).body as { connections: unknown[] }).connections.length, 1);
  assert.equal(((await s.call({ path: '/v1/chat-connections', headers: s.as('alice') })).body as { connections: unknown[] }).connections.length, 2);

  assert.equal((await s.call({ method: 'DELETE', path: `/v1/chat-connections/${id}`, headers: s.as('bob') })).status, 200);
  assert.equal((await rpc(s, next.access_token, 'ping')).status, 401, 'revoked: stops now, not in an hour');
  assert.equal((await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'refresh_token', refresh_token: next.refresh_token } })).status, 400);

  const a = await connect(s, 'bob');
  s.store.instance!.members = s.store.instance!.members.filter((m) => m.email !== 'bob@example.com');
  assert.equal((await rpc(s, a.access_token, 'ping')).status, 401, 'off the team: stops');

  const b = await connect(s, 'alice');
  s.tick(61 * 60_000);
  assert.equal((await rpc(s, b.access_token, 'ping')).status, 401, 'access tokens last an hour');
});

test('a member\'s chat requests are rate limited per member, not per network', async () => {
  const s = setup();
  await addApp(s);
  const { access_token } = await connect(s);
  let last: { isError?: boolean } = {};
  for (let i = 0; i < 61; i++) {
    last = await send(s, access_token, { app: 'Greenroom', type: 'idea', text: `Idea ${i}` });
  }
  assert.equal(last.isError, true);
  assert.equal([...s.store.reports.values()].length, 60);
});

test('a chat token, for chat apps that can\'t sign in with OAuth: same tools, as the member, revocable', async () => {
  const s = setup();
  await addApp(s);
  const made = await s.call({ method: 'POST', path: '/v1/chat-connections', headers: s.as('bob'), body: { name: 'ChatGPT' } });
  assert.equal(made.status, 201);
  const { token, id, mcp_url } = made.body as { token: string; id: string; mcp_url: string };
  assert.match(token, /^hct_[a-f0-9]{24}_/);
  assert.equal(mcp_url, `${BASE}/v1/mcp`);
  assert.ok(!JSON.stringify(s.store.auth.get(`grant:${id}`)).includes(token.split('_')[2]!), 'stored hashed');

  const sent = await send(s, token, { app: 'Greenroom', type: 'idea', text: 'From the bridge', details: 'Phone chat' }) as { structuredContent: { id: string } };
  const r = s.store.reports.get(sent.structuredContent.id)!;
  assert.equal(r.from_member, 'bob@example.com');
  assert.equal(r.via, 'ChatGPT');

  const listed = (await s.call({ path: '/v1/chat-connections', headers: s.as('bob') })).body as { connections: { id: string; kind: string }[] };
  assert.deepEqual(listed.connections.map((c) => c.kind), ['token']);
  assert.equal((await rpc(s, token.slice(0, -2) + 'xx', 'ping')).status, 401, 'a wrong secret');
  assert.equal((await s.call({ method: 'POST', path: '/v1/oauth/token', body: { grant_type: 'refresh_token', refresh_token: `hrt_${id}_${'x'.repeat(30)}` } })).status, 400, 'not a refresh token');
  await s.call({ method: 'DELETE', path: `/v1/chat-connections/${id}`, headers: s.as('bob') });
  assert.equal((await rpc(s, token, 'ping')).status, 401, 'revoked');
  assert.equal((await s.call({ method: 'POST', path: '/v1/chat-connections', headers: {}, body: { name: 'x' } })).status, 401, 'only a signed-in member makes one');
});

test('nothing is sent without a second step: a draft names the app and the others, and can be sent elsewhere', async () => {
  const s = setup();
  await addApp(s, 'Greenroom');
  await addApp(s, 'RasanAI');
  const { access_token } = await connect(s);
  const call = async (name: string, args: Record<string, unknown>) => ((await rpc(s, access_token, 'tools/call', { name, arguments: args })).body as { result: { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> } }).result;

  const noApp = await call('draft_request', { type: 'idea', text: 'A dark mode' });
  assert.match(noApp.content[0]!.text, /No app named, so no draft yet\. The apps on this Heresay: Greenroom \(web\), RasanAI \(web\)\. Which one is it for\?/);
  assert.equal(s.store.reports.size, 0);

  const d = await call('draft_request', { app: 'Greenroom', type: 'idea', text: 'A dark mode', details: 'Night use' });
  assert.match(d.content[0]!.text, /^Draft, not sent yet\. App: Greenroom \(web\)\. Type: idea\./);
  assert.match(d.content[0]!.text, /Other apps it could go to instead: RasanAI \(web\)\./);
  assert.equal(s.store.reports.size, 0, 'a draft is not a report');

  // The old tool name drafts too, so an older bridge never sends unseen.
  const old = await call('send_request', { app: 'Greenroom', type: 'idea', text: 'Old bridge' });
  assert.equal(old.structuredContent.sent, false);
  assert.equal(s.store.reports.size, 0);

  const sent = await call('send_draft', { draft_id: d.structuredContent.draft_id, app: 'RasanAI' });
  const r = s.store.reports.get(sent.structuredContent.id as string)!;
  assert.equal(r.project_id, [...s.store.projects.values()].find((p) => p.name === 'RasanAI')!.id, 'sent where the person said');
  assert.equal(r.details, 'Night use');
  assert.match((await call('send_draft', { draft_id: d.structuredContent.draft_id })).content[0]!.text, /already sent/, 'once');

  // Someone else's draft can't be sent, and drafts expire.
  const other = await connect(s, 'bob');
  const mine = await call('draft_request', { app: 'Greenroom', type: 'idea', text: 'Mine' });
  const theirs = ((await rpc(s, other.access_token, 'tools/call', { name: 'send_draft', arguments: { draft_id: mine.structuredContent.draft_id } })).body as { result: { isError?: boolean } }).result;
  assert.equal(theirs.isError, true);
  s.tick(3 * 3600_000);
  const later = await connect(s);
  assert.equal(((await rpc(s, later.access_token, 'tools/call', { name: 'send_draft', arguments: { draft_id: mine.structuredContent.draft_id } })).body as { result: { isError?: boolean } }).result.isError, true, 'two hours');
});
