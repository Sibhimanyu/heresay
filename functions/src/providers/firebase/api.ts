/**
 * The Firebase adapter: Cloud Functions in front of the core handler, Firestore behind it.
 * A Catalyst adapter would be a sibling of this folder with the same shape.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { auth, db } from './admin.js';
import { FirestoreStore } from './firestore-store.js';
import { handle, type Deps } from '../../core/handler.js';

const deps: Deps = {
  store: new FirestoreStore(db),
  async verifyIdToken(token) {
    try { return (await auth.verifyIdToken(token)).uid; } catch { return null; }
  },
  now: () => Date.now(),
  log: (event, fields) => logger.info(event, { event, ...fields }),
};

/** Hosting rewrites /v1/** here, so the SDK, the API and the dashboard share one origin. */
export const api = onRequest({ region: 'us-central1', maxInstances: 10 }, async (req, res) => {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v[0] : v;
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') query[k] = v;
  const out = await handle({
    method: req.method, path: req.path, query, headers, ip: req.ip ?? '',
    body: req.body,
  }, deps);
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  if (out.status === 204) { res.status(204).end(); return; }
  res.status(out.status).json(out.body);
});
