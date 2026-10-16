/**
 * OAuth 2.1 for chat apps (ChatGPT, Claude and other MCP clients), so a team member can connect
 * one to this Heresay with their own sign-in. Everything a chat app needs to find and use it:
 *
 *   /.well-known/oauth-protected-resource[/v1/mcp]   which server signs people in (RFC 9728)
 *   /.well-known/oauth-authorization-server[/v1]     its endpoints (RFC 8414)
 *   POST /v1/oauth/register                           a chat app registers itself (RFC 7591)
 *   GET  /v1/oauth/authorize                          sends the person to the dashboard to say yes
 *   POST /v1/oauth/approve                            the dashboard, signed in: yes or no
 *   POST /v1/oauth/token                              code (PKCE S256 only) or refresh -> tokens
 *
 * Public clients only (no client secrets), PKCE required, codes used once within ten minutes,
 * access tokens for an hour, refresh tokens rotated on every use. A connection (grant) belongs
 * to one member; removing them from the team, or revoking it in the dashboard, ends it.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Deps, Req, Res } from './handler.js';
import type { AuthRecord, Instance, Member } from './types.js';

export const SCOPE = 'heresay.requests';
const CODE_TTL_MS = 10 * 60_000;
export const ACCESS_TTL_MS = 3600_000;
const REFRESH_TTL_MS = 90 * 24 * 3600_000;

const json = (status: number, body: unknown, headers?: Record<string, string>): Res => ({ status, body, headers });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = (bytes = 32) => randomBytes(bytes).toString('base64url');
/** Ids go before an underscore in a token, so they never contain one. */
const hexId = () => randomBytes(12).toString('hex');
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Chat apps call these from their servers, but tools like the MCP Inspector call from a page. */
export const OPEN_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
};

/**
 * This Heresay's own address, as the chat app sees it. Hosting forwards the host it was asked
 * for; only this Heresay's own origins are believed, so a forged header can't move the issuer.
 */
export function baseUrl(req: Req, deps: Deps): string {
  const own = deps.selfOrigins ?? [];
  const host = req.headers['x-forwarded-host'] ?? req.headers['host'];
  const proto = req.headers['x-forwarded-proto'] ?? (host && /^(127\.0\.0\.1|localhost)(:|$)/.test(host) ? 'http' : 'https');
  const asked = host ? `${proto.split(',')[0]}://${host.split(',')[0]}`.toLowerCase() : null;
  if (asked && own.includes(asked)) return asked;
  return own[0] ?? asked ?? '';
}

export const resourceUrl = (base: string) => `${base}/v1/mcp`;

/** Bodies arrive as JSON or as a form (the token endpoint's usual shape). */
function fields(b: unknown): Record<string, unknown> {
  if (b instanceof Uint8Array) b = Buffer.from(b).toString('utf8');
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(b)); }
  }
  return b && typeof b === 'object' ? b as Record<string, unknown> : {};
}

/** Per network, per hour: these endpoints have no sign-in, so they're limited like /v1/reports. */
async function limited(what: string, limit: number, req: Req, deps: Deps): Promise<boolean> {
  const hour = Math.floor(deps.now() / 3600_000) * 3600_000;
  return deps.store.hit(`oauth-${what}:${sha(req.ip)}:${hour}`, limit, hour + 3600_000);
}

// ---- discovery ---------------------------------------------------------------------------

export function protectedResource(req: Req, deps: Deps): Res {
  const base = baseUrl(req, deps);
  return json(200, {
    resource: resourceUrl(base), authorization_servers: [base], scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'], resource_name: 'Heresay',
  }, OPEN_CORS);
}

export function authorizationServer(req: Req, deps: Deps): Res {
  const base = baseUrl(req, deps);
  return json(200, {
    issuer: base,
    authorization_endpoint: `${base}/v1/oauth/authorize`,
    token_endpoint: `${base}/v1/oauth/token`,
    registration_endpoint: `${base}/v1/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  }, OPEN_CORS);
}

// ---- registration ------------------------------------------------------------------------

/** https anywhere, or http on this computer (for local tools). Nothing else, no fragments. */
export function okRedirect(u: unknown): string | null {
  if (typeof u !== 'string' || u.length > 500) return null;
  try {
    const x = new URL(u);
    if (x.hash) return null;
    if (x.protocol === 'https:') return x.href;
    if (x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname)) return x.href;
  } catch { /* not a URL */ }
  return null;
}

export async function register(req: Req, deps: Deps): Promise<Res> {
  const b = fields(req.body);
  const now = deps.now();
  if (!(await limited('register', 20, req, deps))) return json(429, { error: 'too_many_requests' }, OPEN_CORS);
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(okRedirect) : [];
  if (!uris.length || uris.some((u) => !u)) {
    return json(400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https URLs (or http on localhost)' }, OPEN_CORS);
  }
  // Every client is public here (PKCE does the proving). One that asks for a secret is told, in
  // the response, that it has none; refusing it would leave apps that default to a secret
  // (some do) unable to connect at all.
  const client_id = `hc_${secret(16)}`;
  const name = str(b.client_name, 80) ?? new URL(uris[0]!).hostname;
  await deps.store.putAuth({
    kind: 'client', id: client_id, expires_at: null,
    data: { name, redirect_uris: uris, created_at: new Date(now).toISOString() },
  });
  deps.log('oauth.client_registered', { client_id, name });
  return json(201, {
    client_id, client_id_issued_at: Math.floor(now / 1000), client_name: name, redirect_uris: uris,
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  }, OPEN_CORS);
}

// ---- authorizing -------------------------------------------------------------------------

interface AuthorizeAsk {
  client_id: string; redirect_uri: string; state: string | null;
  code_challenge: string; scope: string; client: AuthRecord;
}

/** The request is one we'd say yes to: a known client, its own redirect, PKCE S256. */
async function checkAsk(q: Record<string, unknown>, deps: Deps): Promise<AuthorizeAsk | { error: string; description: string }> {
  const client_id = str(q.client_id, 100);
  const client = client_id ? await deps.store.getAuth('client', client_id) : null;
  if (!client_id || !client) return { error: 'invalid_client', description: 'This chat app isn\'t registered here. Add the connector again.' };
  const redirect_uri = okRedirect(q.redirect_uri);
  if (!redirect_uri || !(client.data.redirect_uris as string[]).includes(redirect_uri)) {
    return { error: 'invalid_request', description: 'redirect_uri doesn\'t match the one registered' };
  }
  if (q.response_type !== 'code') return { error: 'unsupported_response_type', description: 'response_type must be code' };
  const code_challenge = str(q.code_challenge, 200);
  if (!code_challenge || q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(code_challenge)) {
    return { error: 'invalid_request', description: 'PKCE with S256 is required' };
  }
  return { client_id, redirect_uri, state: str(q.state, 500), code_challenge, scope: SCOPE, client };
}

const withParams = (u: string, p: Record<string, string | null>) => {
  const x = new URL(u);
  for (const [k, v] of Object.entries(p)) if (v != null) x.searchParams.set(k, v);
  return x.href;
};

/** The chat app sends the person here. They say yes on the dashboard, signed in as themselves. */
export async function authorize(req: Req, deps: Deps): Promise<Res> {
  if (!(await limited('authorize', 120, req, deps))) return json(429, { error: 'too_many_requests' });
  const ask = await checkAsk(req.query, deps);
  // A bad client or redirect is shown, never redirected to: that's how open redirects happen.
  if ('error' in ask) return json(400, { error: ask.error, error_description: ask.description });
  const keep = new URLSearchParams();
  for (const k of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type', 'scope', 'resource']) {
    const v = req.query[k];
    if (v) keep.set(k, v);
  }
  return json(302, { redirect: true }, { location: `${baseUrl(req, deps)}/app/#/authorize?${keep}` });
}

/** What the dashboard shows on the "Allow?" page, before anyone says yes. */
export async function describeAsk(q: Record<string, unknown>, deps: Deps): Promise<Res> {
  const ask = await checkAsk(q, deps);
  if ('error' in ask) return json(400, { error: ask.description, code: ask.error });
  return json(200, { client_name: ask.client.data.name, redirect_host: new URL(ask.redirect_uri).host });
}

/** POST /v1/oauth/approve, from the dashboard, as the signed-in member. */
export async function approve(member: Member, req: Req, deps: Deps): Promise<Res> {
  const b = fields(req.body);
  const ask = await checkAsk(b, deps);
  if ('error' in ask) return json(400, { error: ask.description, code: ask.error });
  if (b.allow !== true) {
    deps.log('oauth.denied', { client_id: ask.client_id, by: member.email });
    return json(200, { redirect: withParams(ask.redirect_uri, { error: 'access_denied', state: ask.state }) });
  }
  const code = secret();
  await deps.store.putAuth({
    kind: 'code', id: sha(code), expires_at: new Date(deps.now() + CODE_TTL_MS).toISOString(),
    data: { client_id: ask.client_id, redirect_uri: ask.redirect_uri, code_challenge: ask.code_challenge, email: member.email, scope: ask.scope },
  });
  deps.log('oauth.approved', { client_id: ask.client_id, by: member.email });
  return json(200, { redirect: withParams(ask.redirect_uri, { code, state: ask.state }) });
}

// ---- tokens ------------------------------------------------------------------------------

const tokenError = (error: string, error_description: string, status = 400) =>
  json(status, { error, error_description }, { ...OPEN_CORS, 'cache-control': 'no-store' });

/** hat_<id>_<secret> for access, hrt_<grant>_<secret> for refresh: the id finds it, the hash checks it. */
async function issue(grant: AuthRecord, deps: Deps): Promise<Res> {
  const now = deps.now();
  const accessId = hexId(), accessSecret = secret();
  await deps.store.putAuth({
    kind: 'access', id: accessId, expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
    data: { grant_id: grant.id, hash: sha(accessSecret) },
  });
  const refreshSecret = secret();
  await deps.store.putAuth({
    ...grant, expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
    data: { ...grant.data, refresh_hash: sha(refreshSecret), refreshed_at: new Date(now).toISOString() },
  });
  return json(200, {
    access_token: `hat_${accessId}_${accessSecret}`, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000,
    refresh_token: `hrt_${grant.id}_${refreshSecret}`, scope: SCOPE,
  }, { ...OPEN_CORS, 'cache-control': 'no-store' });
}

/** S256: base64url(sha256(verifier)) must equal the challenge sent at the start. */
export const pkce = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export async function token(req: Req, deps: Deps): Promise<Res> {
  if (!(await limited('token', 240, req, deps))) return tokenError('too_many_requests', 'Try again later.', 429);
  const b = fields(req.body);
  // A client that registered as if it had a secret may send its id in Basic auth instead. The
  // secret part means nothing here (there is none); the id still has to match.
  const basic = /^Basic\s+([A-Za-z0-9+/=]+)$/.exec(req.headers['authorization'] ?? '');
  if (basic && !b.client_id) {
    const id = Buffer.from(basic[1]!, 'base64').toString('utf8').split(':')[0];
    if (id) b.client_id = decodeURIComponent(id);
  }
  const instance = await deps.store.getInstance();
  if (b.grant_type === 'authorization_code') {
    const code = str(b.code, 200), verifier = str(b.code_verifier, 200);
    if (!code || !verifier) return tokenError('invalid_request', 'code and code_verifier are required');
    const c = await deps.store.takeAuth('code', sha(code));
    if (!c || Date.parse(c.expires_at ?? '') < deps.now()) return tokenError('invalid_grant', 'This code was used, has expired, or never existed.');
    if (c.data.client_id !== b.client_id || c.data.redirect_uri !== okRedirect(b.redirect_uri)) {
      return tokenError('invalid_grant', 'client_id or redirect_uri doesn\'t match the code');
    }
    if (!same(pkce(verifier), String(c.data.code_challenge))) return tokenError('invalid_grant', 'code_verifier doesn\'t match');
    if (!onTeam(instance, String(c.data.email))) return tokenError('invalid_grant', 'That person is no longer on this Heresay\'s team.');
    const client = await deps.store.getAuth('client', String(c.data.client_id));
    const grant: AuthRecord = {
      kind: 'grant', id: hexId(), expires_at: null,
      data: {
        email: c.data.email, client_id: c.data.client_id, client_name: client?.data.name ?? 'A chat app',
        created_at: new Date(deps.now()).toISOString(), last_used_at: null, revoked_at: null,
      },
    };
    deps.log('oauth.connected', { grant_id: grant.id, by: c.data.email, client: grant.data.client_name });
    return issue(grant, deps);
  }
  if (b.grant_type === 'refresh_token') {
    const m = /^hrt_([a-f0-9]{24})_([A-Za-z0-9_-]{20,80})$/.exec(String(b.refresh_token ?? ''));
    const grant = m ? await deps.store.getAuth('grant', m[1]!) : null;
    if (!m || !grant || grant.data.revoked_at || !same(sha(m[2]!), String(grant.data.refresh_hash))
      || (grant.expires_at && Date.parse(grant.expires_at) < deps.now())) {
      return tokenError('invalid_grant', 'This connection was revoked or has expired. Connect again.');
    }
    if (b.client_id && b.client_id !== grant.data.client_id) return tokenError('invalid_grant', 'client_id doesn\'t match');
    if (!onTeam(instance, String(grant.data.email))) return tokenError('invalid_grant', 'That person is no longer on this Heresay\'s team.');
    return issue(grant, deps);
  }
  return tokenError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}

const onTeam = (i: Instance | null, email: string) =>
  !!i?.members.some((m) => m.email.toLowerCase() === email.toLowerCase());

/**
 * Who a chat app's access token is for: the member and their connection, or null. Checked on
 * every call, so a revoked connection or a removed member stops at once, not in an hour.
 */
export async function chatCaller(req: Req, deps: Deps): Promise<{ member: Member; grant: AuthRecord } | null> {
  const auth = req.headers['authorization'] ?? '';
  let grant: AuthRecord | null = null;
  const m = /^Bearer hat_([a-f0-9]{24})_([A-Za-z0-9_-]{20,80})$/.exec(auth);
  // A chat token (hct_), for chat apps that can't sign in with OAuth: the grant itself checks it.
  const t = /^Bearer hct_([a-f0-9]{24})_([A-Za-z0-9_-]{20,80})$/.exec(auth);
  if (m) {
    const a = await deps.store.getAuth('access', m[1]!);
    if (!a || !same(sha(m[2]!), String(a.data.hash)) || Date.parse(a.expires_at ?? '') < deps.now()) return null;
    grant = await deps.store.getAuth('grant', String(a.data.grant_id));
  } else if (t) {
    grant = await deps.store.getAuth('grant', t[1]!);
    if (!grant || !grant.data.token_hash || !same(sha(t[2]!), String(grant.data.token_hash))) return null;
  } else {
    return null;
  }
  if (!grant || grant.data.revoked_at) return null;
  const instance = await deps.store.getInstance();
  const member = instance?.members.find((x) => x.email.toLowerCase() === String(grant.data.email).toLowerCase());
  if (!member) return null;
  // At most once a minute, so the dashboard can say when it was last used.
  const last = Date.parse(String(grant.data.last_used_at ?? '')) || 0;
  if (deps.now() - last > 60_000) {
    await deps.store.putAuth({ ...grant, data: { ...grant.data, last_used_at: new Date(deps.now()).toISOString() } });
  }
  return { member, grant };
}

/** 401 that tells a chat app where to sign in (RFC 9728 §5.1). */
export const signInFirst = (req: Req, deps: Deps) => json(401, {
  jsonrpc: '2.0', error: { code: -32001, message: 'Sign in to this Heresay first.' }, id: null,
}, {
  ...OPEN_CORS,
  'www-authenticate': `Bearer realm="heresay", resource_metadata="${baseUrl(req, deps)}/.well-known/oauth-protected-resource/v1/mcp", scope="${SCOPE}"`,
});

// ---- connections, from the dashboard -------------------------------------------------------

/**
 * GET /v1/chat-connections, DELETE /v1/chat-connections/:id: yours, or anyone's for an owner.
 * POST /v1/chat-connections { name }: a chat token, for a chat app that can't sign in with
 * OAuth (a ChatGPT Sites bridge, a script). Same three tools, as you; shown once, stored hashed,
 * revoked like any connection.
 */
export async function connections(p: string[], member: Member, req: Req, deps: Deps): Promise<Res> {
  const mine = (g: AuthRecord) => String(g.data.email).toLowerCase() === member.email.toLowerCase();
  if (p.length === 1 && req.method === 'POST') {
    const name = str(fields(req.body).name, 80) ?? 'A chat app';
    const mineNow = (await deps.store.listAuth('grant')).filter((g) => !g.data.revoked_at && mine(g) && g.data.token_hash);
    if (mineNow.length >= 10) return json(400, { error: 'You have 10 chat tokens. Disconnect one first.' });
    const id = hexId(), tokenSecret = secret();
    await deps.store.putAuth({
      kind: 'grant', id, expires_at: null,
      data: {
        email: member.email, client_id: null, client_name: name, kind: 'token', token_hash: sha(tokenSecret),
        created_at: new Date(deps.now()).toISOString(), last_used_at: null, revoked_at: null,
      },
    });
    deps.log('oauth.token_created', { grant_id: id, by: member.email, name });
    return json(201, { id, token: `hct_${id}_${tokenSecret}`, name, mcp_url: resourceUrl(baseUrl(req, deps)) });
  }
  if (p.length === 1 && req.method === 'GET') {
    const all = (await deps.store.listAuth('grant')).filter((g) => !g.data.revoked_at && (member.role === 'owner' || mine(g)));
    all.sort((a, b) => String(a.data.created_at).localeCompare(String(b.data.created_at)));
    return json(200, {
      connections: all.map((g) => ({
        id: g.id, email: g.data.email, client_name: g.data.client_name, kind: g.data.token_hash ? 'token' : 'oauth',
        created_at: g.data.created_at, last_used_at: g.data.last_used_at ?? null,
      })),
    });
  }
  if (p.length === 2 && req.method === 'DELETE') {
    const g = await deps.store.getAuth('grant', p[1]!);
    if (!g || g.data.revoked_at) return json(404, { error: 'no such connection' });
    if (!mine(g) && member.role !== 'owner') return json(403, { error: 'Only an owner can disconnect someone else\'s chat app.' });
    await deps.store.putAuth({ ...g, data: { ...g.data, revoked_at: new Date(deps.now()).toISOString(), revoked_by: member.email } });
    deps.log('oauth.revoked', { grant_id: g.id, by: member.email });
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
}
