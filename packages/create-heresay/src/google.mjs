/**
 * Google Cloud REST calls, signed with the account the Firebase tools are logged in as.
 * We reuse that login instead of asking for a second one: the refresh token it holds already
 * has the cloud-platform scope, which covers billing, services, Firestore and Auth config.
 */
import { createRequire } from 'node:module';
import { firebaseJson, log } from './firebase.mjs';

const require = createRequire(import.meta.url);
const fbApi = require('firebase-tools/lib/api.js');

export class GoogleError extends Error {
  constructor(message, status, reason) { super(message); this.status = status; this.reason = reason; }
}

let token = null;

/** The logged-in account, or null. */
export async function account() {
  // login:list prints the tokens, so its output is kept out of the log.
  const r = await firebaseJson(['login:list'], { secret: true });
  const first = Array.isArray(r) ? r[0] : null;
  if (!first) return null;
  token = { refresh: first.tokens?.refresh_token, access: null, until: 0 };
  return first.user?.email ?? null;
}

async function accessToken() {
  if (!token) await account();
  if (!token?.refresh) throw new GoogleError('Not signed in to Google.', 401, 'unauthenticated');
  if (token.access && Date.now() < token.until) return token.access;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: token.refresh,
      client_id: fbApi.clientId(), client_secret: fbApi.clientSecret(),
    }),
  });
  const b = await r.json();
  if (!b.access_token) throw new GoogleError('Your Google sign-in has expired. Run this again to sign in.', 401, 'unauthenticated');
  token.access = b.access_token;
  token.until = Date.now() + (b.expires_in - 120) * 1000;
  return token.access;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One JSON call. Retries rate limits, server errors and network blips, because fresh projects
 * answer flakily for their first minutes. Returns null for 404 when `missingOk` is set.
 */
export async function g(method, url, { body, project, missingOk = false, tries = 6 } = {}) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          'content-type': 'application/json',
          // Bill quota to the user's project, not the Firebase CLI's own OAuth project.
          ...(project ? { 'x-goog-user-project': project } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (i < tries) { await sleep(1500 * 2 ** i); continue; }
      throw new GoogleError(`Couldn't reach Google (${e.cause?.code ?? e.message}). Check your connection and run this again.`, 0, 'network');
    }
    log(`${method} ${url.replace(/\?.*/, '')} -> ${res.status}`);
    if (missingOk && res.status === 404) return null;
    const text = await res.text();
    let b = {};
    try { b = text ? JSON.parse(text) : {}; } catch { b = { raw: text }; }
    if (res.ok) return b;
    if ((res.status === 429 || res.status >= 500) && i < tries) { await sleep(1500 * 2 ** i); continue; }
    const err = b.error ?? {};
    log(`  ${err.status ?? ''} ${err.message ?? text.slice(0, 300)}`);
    const reason = err.status ?? err.details?.find?.((d) => d.reason)?.reason ?? String(res.status);
    throw new GoogleError(err.message ?? `${method} ${url} failed with ${res.status}`, res.status, reason);
  }
}

/** Wait for a long-running operation. `base` is the API root the operation name hangs off. */
export async function op(base, operation, { project, timeoutMs = 5 * 60_000 } = {}) {
  const until = Date.now() + timeoutMs;
  let o = operation;
  while (!o.done) {
    if (Date.now() > until) throw new GoogleError(`Google is still working on ${o.name}. Run this again in a minute.`, 0, 'timeout');
    await sleep(2000);
    o = await g('GET', `${base}/${o.name}`, { project });
  }
  if (o.error) throw new GoogleError(o.error.message, o.error.code, 'operation_failed');
  return o.response ?? o;
}

/** Retry `fn` while it throws, for APIs that need a moment after being switched on. */
export async function patiently(fn, { forMs = 120_000, every = 5000 } = {}) {
  const until = Date.now() + forMs;
  for (;;) {
    try { return await fn(); } catch (e) {
      if (Date.now() > until || e.status === 401) throw e;
      await sleep(every);
    }
  }
}
