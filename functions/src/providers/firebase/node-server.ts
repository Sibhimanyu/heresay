/**
 * Lite hosting: the same core handler and Firestore store as api.ts, as a plain Node server, so
 * the API can run anywhere that runs Node while Firestore and Auth stay on the free Spark plan
 * (Cloud Functions needs Blaze). It also serves public/ and the few Firebase Hosting URLs the
 * dashboard relies on, so one origin still serves the SDK, the API and the dashboard.
 *
 * Nothing here is imported by the Cloud Functions deploy; run it with `npm run serve:lite`.
 * Needs HERESAY_ORIGIN, HERESAY_FIREBASE_CONFIG (the web app config as JSON), GCLOUD_PROJECT
 * and credentials for firebase-admin (GOOGLE_APPLICATION_CREDENTIALS). Set HERESAY_TRUST_PROXY=1
 * behind a proxy that sets x-forwarded-for. HERESAY_RATE_STORE=firestore shares rate limits
 * across instances at the cost of Firestore reads and writes.
 */
import './lite-env.js'; // first: it must run before firebase-admin starts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth, db } from './admin.js';
import { FirestoreStore } from './firestore-store.js';
import { handle, type Deps } from '../../core/handler.js';
import { VERSION } from '../../core/version.js';
import { notificationSender, telegramLookup, telegramPhoto } from '../../core/notifications.js';
import { telegramApi } from '../../core/telegram.js';

const PUBLIC_DIR = resolve(fileURLToPath(new URL('../../../../public', import.meta.url)));
const FIREBASE_JS = '10.14.1';
const MAX_BODY = 256 * 1024;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const origin = process.env.HERESAY_ORIGIN?.replace(/\/$/, '') ?? '';
const trustProxy = process.env.HERESAY_TRUST_PROXY === '1';

/**
 * Rate-limit counters are the biggest Firestore cost per request (a read and a write each), and
 * on the free Spark plan reads and writes are the budget. A single Lite process can count in
 * memory instead; the counts reset when it restarts, which only ever lets a few extra requests
 * through. Run more than one instance, or set HERESAY_RATE_STORE=firestore, to share counters.
 */
class LiteStore extends FirestoreStore {
  private counts = new Map<string, { n: number; expires: number }>();
  override async hit(bucket: string, limit: number, expires_at: number) {
    const now = Date.now();
    if (this.counts.size > 20_000) for (const [k, v] of this.counts) if (v.expires <= now) this.counts.delete(k);
    const c = this.counts.get(bucket);
    const n = c && c.expires > now ? c.n : 0;
    if (n >= limit) return false;
    this.counts.set(bucket, { n: n + 1, expires: expires_at });
    return true;
  }
}

const deps: Deps = {
  store: process.env.HERESAY_RATE_STORE === 'firestore' ? new FirestoreStore(db) : new LiteStore(db),
  async verifyIdToken(token) {
    try {
      const t = await auth.verifyIdToken(token);
      return { uid: t.uid, email: t.email ?? null, emailVerified: t.email_verified === true };
    } catch { return null; }
  },
  now: () => Date.now(),
  log: (event, fields) => console.log(JSON.stringify({ severity: 'INFO', event, ...fields })),
  version: VERSION,
  selfOrigins: origin ? [origin] : [],
  sendNotification: notificationSender(),
  telegramLookup: telegramLookup(),
  telegramPhoto: telegramPhoto(),
  telegramApi: telegramApi(),
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { fail(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return ok(undefined);
      const type = req.headers['content-type'] ?? '';
      if (type.includes('application/x-www-form-urlencoded')) return ok(Object.fromEntries(new URLSearchParams(text)));
      try { ok(JSON.parse(text)); } catch { ok(text); }
    });
    req.on('error', fail);
  });
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (trustProxy && typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? '';
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of url.searchParams) query[k] = v;
  let body: unknown;
  try { body = await readBody(req); } catch { res.writeHead(413).end(); return; }
  const out = await handle({ method: req.method ?? 'GET', path: url.pathname, query, headers, ip: clientIp(req), body }, deps);
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  if (out.status === 204 || out.body === null) { res.writeHead(out.status).end(); return; }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.writeHead(out.status).end(JSON.stringify(out.body));
}

/** The URLs Firebase Hosting reserves and the dashboard loads: the web config and the SDK files. */
function reserved(res: ServerResponse, path: string): boolean {
  if (path === '/__/firebase/init.js') {
    const config = process.env.HERESAY_FIREBASE_CONFIG ?? '{}';
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    // Hosting wires the Auth emulator itself; here the same variable the admin SDK reads does it.
    const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const emulator = emu ? `firebase.auth().useEmulator(${JSON.stringify(`http://${emu}`)}, { disableWarnings: true });\n` : '';
    res.end(`if (typeof firebase === 'undefined') throw new Error('firebase not loaded');\nfirebase.initializeApp(${config});\n${emulator}`);
    return true;
  }
  const m = /^\/__\/firebase\/(\d+\.\d+\.\d+)\/([\w.-]+\.js)$/.exec(path);
  if (m) {
    res.writeHead(302, { location: `https://www.gstatic.com/firebasejs/${m[1]}/${m[2]}`, 'cache-control': 'public, max-age=86400' });
    res.end();
    return true;
  }
  return false;
}

async function file(res: ServerResponse, path: string): Promise<void> {
  let rel = path === '/sdk/v1.js' ? '/sdk.js' : path;
  if (rel.endsWith('/')) rel += 'index.html';
  const full = join(PUBLIC_DIR, normalize(rel));
  if (!full.startsWith(PUBLIC_DIR + '/') || rel.split('/').some((p) => p.startsWith('.'))) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(full);
    const sdk = rel === '/sdk.js';
    res.writeHead(200, {
      'content-type': TYPES[extname(full)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      ...(sdk ? { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } : {}),
    });
    res.end(data);
  } catch {
    try {
      const html = await readFile(join(PUBLIC_DIR, rel.replace(/\/?$/, '/index.html')));
      res.writeHead(200, { 'content-type': TYPES['.html'], 'x-content-type-options': 'nosniff' });
      res.end(html);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); }
  }
}

export const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  const run = path.startsWith('/v1/') || path.startsWith('/.well-known/')
    ? api(req, res, url)
    : reserved(res, path) ? Promise.resolve() : file(res, path);
  run.catch((e) => {
    deps.log('lite.error', { message: String(e) });
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"internal"}');
  });
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, () => console.log(`heresay lite on :${port}`));
}
