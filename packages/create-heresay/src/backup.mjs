/**
 * Backup and restore of a Heresay's data: every Firestore document, as Firestore's own typed
 * values, so a restore puts back exactly what was there (timestamps, nulls, nested maps).
 *
 * Not included: rate-limit counters (`rate/`, short-lived by design) and Firebase Auth's user
 * list. Nobody needs the latter: the team is the member list in `meta/instance`, kept by email,
 * and members sign in again with an email link on the restored Heresay.
 *
 * The file holds secrets (Telegram and Cliq tokens, hashed agent tokens, chat-app grants), so it
 * is written readable by its owner only.
 *
 * `call(method, url, opts)` is google.mjs's `g`; tests pass one that talks to the emulator.
 */
export const FORMAT = 'heresay-backup';
const SKIP_ROOT = new Set(['rate']);
const BATCH = 400;

const root = (base, id) => `${base}/projects/${id}/databases/(default)/documents`;

async function collectionIds(call, parent, project) {
  const ids = [];
  let pageToken;
  do {
    const b = await call('POST', `${parent}:listCollectionIds`, { project, body: { pageSize: 300, ...(pageToken ? { pageToken } : {}) } });
    ids.push(...(b.collectionIds ?? []));
    pageToken = b.nextPageToken;
  } while (pageToken);
  return ids;
}

/** Every document under `parent`, depth first. `showMissing` finds documents that only exist as a parent of subcollections. */
async function walk(call, base, project, parent, prefix, out, say) {
  for (const col of await collectionIds(call, parent, project)) {
    if (!prefix && SKIP_ROOT.has(col)) continue;
    let pageToken;
    do {
      const q = new URLSearchParams({ pageSize: '300', showMissing: 'true', ...(pageToken ? { pageToken } : {}) });
      const b = await call('GET', `${parent}/${col}?${q}`, { project });
      for (const d of b.documents ?? []) {
        const path = d.name.slice(d.name.indexOf('/documents/') + '/documents/'.length);
        if (d.createTime) out.push({ path, fields: d.fields ?? {} });
        if (out.length % 200 === 0) say?.(`Read ${out.length} documents`);
        // Heresay's ids hold colons (`auth/code:x`). Firestore can't list subcollections under those
        // (the colon reads as a method call, encoded or not). In Heresay they are leaf documents; any
        // that can't be scanned is listed in the backup, never skipped silently.
        const url = `${root(base, project)}/${path.split('/').map(encodeURIComponent).join('/')}`;
        try { await walk(call, base, project, url, path, out, say); } catch (e) {
          if (!path.split('/').pop().includes(':') || !/400|INVALID_ARGUMENT|isn't valid/i.test(String(e.message ?? e) + (e.status ?? ''))) throw e;
          out.unscanned.push(path);
        }
      }
      pageToken = b.nextPageToken;
    } while (pageToken);
  }
}

export async function dump(call, { base, project, version, say }) {
  const documents = [];
  documents.unscanned = [];
  await walk(call, base, project, root(base, project), '', documents, say);
  const unscanned = documents.unscanned;
  documents.sort((a, b) => a.path.localeCompare(b.path));
  return { format: FORMAT, format_version: 1, heresay: version, project, created_at: new Date().toISOString(), skipped: [...SKIP_ROOT], unscanned, documents: [...documents] };
}

export function summarize(backup) {
  const by = {};
  for (const d of backup.documents) {
    const parts = d.path.split('/');
    const kind = parts.length >= 4 ? parts[parts.length - 2] : parts[0];
    by[kind] = (by[kind] ?? 0) + 1;
  }
  return by;
}

export function check(backup) {
  if (backup?.format !== FORMAT || backup.format_version !== 1 || !Array.isArray(backup.documents)) {
    throw new Error('That file isn’t a Heresay backup.');
  }
  for (const d of backup.documents) {
    const parts = typeof d.path === 'string' ? d.path.split('/') : [];
    const sound = parts.length >= 2 && parts.length % 2 === 0 && parts.every((x) => x && x !== '.' && x !== '..');
    if (!sound || !d.fields || typeof d.fields !== 'object') {
      throw new Error(`The backup has a damaged entry (${String(d.path).slice(0, 60)}).`);
    }
  }
  return backup;
}

/** True if the project already holds a Heresay (its team document). */
export async function hasData(call, { base, project }) {
  const ids = (await collectionIds(call, root(base, project), project)).filter((c) => !SKIP_ROOT.has(c));
  return ids.length > 0;
}

/** Writes every document, overwriting any with the same path. Returns how many. */
export async function restore(call, backup, { base, project, say }) {
  check(backup);
  const docs = root(base, project);
  let n = 0;
  for (let i = 0; i < backup.documents.length; i += BATCH) {
    const writes = backup.documents.slice(i, i + BATCH).map((d) => ({ update: { name: `projects/${project}/databases/(default)/documents/${d.path}`, fields: d.fields } }));
    await call('POST', `${docs}:commit`, { project, body: { writes } });
    n += writes.length;
    say?.(`Wrote ${n} of ${backup.documents.length}`);
  }
  return n;
}
