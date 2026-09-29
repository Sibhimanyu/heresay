/**
 * Which Heresay this repo talks to, with which token, and the calls to it. Shared by the MCP
 * server and the CLI commands, so both do exactly the same thing.
 *
 * The token lives in ~/.heresay/connections.json, keyed by repo folder, never in the repo.
 * HERESAY_URL and HERESAY_TOKEN override it (CI, tests).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export const HOME = process.env.HERESAY_HOME || join(homedir(), '.heresay');
const CONNECTIONS = join(HOME, 'connections.json');

const git = (args, cwd) => {
  try { return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
};

/** The repo this folder belongs to: its root, and a stable name for it. */
export function repoAt(cwd = process.cwd()) {
  const root = git(['rev-parse', '--show-toplevel'], cwd) ?? cwd;
  const remote = git(['remote', 'get-url', 'origin'], root);
  return { root, name: normaliseRepo(remote) ?? `local/${basename(root).toLowerCase()}` };
}

/** Same rules as the server, so the names match. */
export function normaliseRepo(v) {
  if (!v || typeof v !== 'string') return null;
  const r = v.trim().toLowerCase()
    .replace(/^git@([^:]+):/, '$1/').replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '')
    .replace(/\.git$/, '').replace(/\/+$/, '');
  return /^[a-z0-9._~/-]+$/.test(r) ? r : null;
}

export function loadConnections() {
  if (!existsSync(CONNECTIONS)) return {};
  try { return JSON.parse(readFileSync(CONNECTIONS, 'utf8')); } catch { return {}; }
}

export function saveConnection(root, conn) {
  mkdirSync(HOME, { recursive: true, mode: 0o700 });
  const all = loadConnections();
  all[root] = { ...conn, connected_at: new Date().toISOString() };
  writeFileSync(CONNECTIONS, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
}

/** { url, token, repo } for this folder, or null. */
export function connection(cwd = process.cwd()) {
  if (process.env.HERESAY_URL && process.env.HERESAY_TOKEN) {
    return { url: process.env.HERESAY_URL.replace(/\/+$/, ''), token: process.env.HERESAY_TOKEN, repo: repoAt(cwd).name };
  }
  const { root } = repoAt(cwd);
  return loadConnections()[root] ?? null;
}

export class HeresayError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

export function client(conn) {
  if (!conn) {
    throw new HeresayError('This repo is not connected to a Heresay. Run `npx heresay connect` in it first.', 0);
  }
  const call = async (method, path, body) => {
    let res;
    try {
      res = await fetch(`${conn.url}/v1/agent${path}`, {
        method,
        headers: { authorization: `Bearer ${conn.token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new HeresayError(`Couldn't reach ${conn.url} (${e.cause?.code ?? e.name}).`, 0);
    }
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new HeresayError(b.error ?? `HTTP ${res.status}`, res.status, b);
    return b;
  };
  const enc = encodeURIComponent;
  return {
    conn,
    me: () => call('GET', '/me'),
    apps: () => call('GET', '/apps'),
    createApp: (a) => call('POST', '/apps', a),
    check: (app) => call('GET', `/apps/${enc(app)}/check`),
    briefs: () => call('GET', '/briefs'),
    brief: (id) => call('GET', `/briefs/${enc(id)}`),
    claim: (id) => call('POST', `/briefs/${enc(id)}/claim`),
    note: (id, note) => call('POST', `/briefs/${enc(id)}/notes`, { note }),
    handoff: (id, repo, note) => call('POST', `/briefs/${enc(id)}/handoff`, { repo, note }),
    fixed: (id, note) => call('POST', `/briefs/${enc(id)}/fixed`, { note }),
  };
}

// ---- guides, fetched from the Heresay itself ----------------------------------------------

export const SKILL_VERSION = 1;

/** The bootstrap skill version installed in this repo, or null. */
export function repoSkillVersion(root) {
  const f = join(root, '.claude', 'skills', 'heresay', 'SKILL.md');
  if (!existsSync(f)) return null;
  const m = /heresay-skill-version:\s*(\d+)/.exec(readFileSync(f, 'utf8'));
  return m ? Number(m[1]) : null;
}

/**
 * A guide topic, fresh from the instance so it matches what's deployed there. Falls back to
 * the last copy fetched when the network is down, and says so.
 */
export async function guide(conn, topic) {
  const safe = String(topic || 'start').replace(/[^a-z0-9-]/g, '');
  const cacheDir = join(HOME, 'guides', new URL(conn.url).host);
  const cache = join(cacheDir, `${safe}.md`);
  let text, index, stale = false;
  try {
    const [t, i] = await Promise.all([
      fetch(`${conn.url}/guides/${safe}.md`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${conn.url}/guides/index.json`, { signal: AbortSignal.timeout(10_000) }),
    ]);
    index = i.ok ? await i.json() : null;
    if (!t.ok) {
      const topics = index ? Object.keys(index.topics).join(', ') : 'start, install-web, fix-brief, write-note';
      throw new HeresayError(`No guide called "${safe}". Topics: ${topics}`, 404);
    }
    text = await t.text();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cache, text);
    if (index) writeFileSync(join(cacheDir, 'index.json'), JSON.stringify(index));
  } catch (e) {
    if (e instanceof HeresayError && e.status === 404) throw e;
    if (!existsSync(cache)) throw new HeresayError(`Couldn't fetch the "${safe}" guide from ${conn.url}, and there is no saved copy.`, 0);
    text = readFileSync(cache, 'utf8');
    try { index = JSON.parse(readFileSync(join(cacheDir, 'index.json'), 'utf8')); } catch { index = null; }
    stale = true;
  }
  const notes = [];
  if (stale) notes.push(`(Offline: this is the copy saved on ${new Date().toDateString()} or earlier, and may be out of date.)`);
  const latest = index?.skill_version ?? SKILL_VERSION;
  const have = repoSkillVersion(repoAt().root);
  if (have !== null && have < latest) {
    notes.push(`The Heresay skill in this repo is version ${have}; version ${latest} is out. Run \`npx heresay connect --update\` and commit the change.`);
  }
  return { text: [...notes, text].join('\n\n'), skill_version: latest, stale };
}

export const SWIFT_PACKAGE = 'https://github.com/Sibhimanyu/heresay-swift';

/** The install guide for the app's platform, with its key filled in. */
export async function installGuide(conn, app) {
  if (app.platform === 'ios' || app.platform === 'macos') {
    const g = await guide(conn, 'install-apple');
    return [
      `App: ${app.name} (${app.id}), platform ${app.platform}. Key: ${app.key}`,
      '',
      g.text.replaceAll('SWIFT_PACKAGE', SWIFT_PACKAGE).replaceAll('HERESAY_URL', conn.url).replaceAll('KEY', app.key),
    ].join('\n');
  }
  const sdk = `${conn.url}/sdk/v1.js`;
  const tag = `<script src="${sdk}" data-key="${app.key}" defer></script>`;
  const g = await guide(conn, 'install-web');
  const known = app.framework
    ? `This app is built with ${app.framework}${app.framework_detected ? ' (detected from a report)' : ''}.`
    : 'Nobody has said what this app is built with; look at the repo.';
  return [
    `App: ${app.name} (${app.id}), platform ${app.platform}. ${known}`,
    `Sites allowed to send reports: ${app.allowed_origins.length ? app.allowed_origins.join(', ') : 'any'}.`,
    '',
    `The tag for this app:\n\n    ${tag}`,
    '',
    g.text.replaceAll('SDK_URL', sdk).replaceAll('KEY', app.key),
  ].join('\n');
}
