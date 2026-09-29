/**
 * Which Heresay this repo talks to, with which token, and the calls to it. Shared by the MCP
 * server and the CLI commands, so both do exactly the same thing.
 *
 * The token lives in ~/.heresay/connections.json, keyed by repo folder, never in the repo.
 * HERESAY_URL and HERESAY_TOKEN override it (CI, tests).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, relative, sep } from 'node:path';

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

/** Forget this repo's token. Returns whether there was one. */
export function removeConnection(root) {
  const all = loadConnections();
  if (!(root in all)) return false;
  delete all[root];
  writeFileSync(CONNECTIONS, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  return true;
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
    bind: (repo) => call('POST', '/bind', { repo }),
    apps: () => call('GET', '/apps'),
    createApp: (a) => call('POST', '/apps', a),
    check: (app) => call('GET', `/apps/${enc(app)}/check`),
    verify: (app, file) => call('POST', `/apps/${enc(app)}/verify`, { file }),
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
/** What the team said about sign-in, as an instruction. */
function signInLine(app) {
  if (app.sign_in === 'yes') return 'People sign in to this app: the identify call in step 3 is required, not optional.';
  if (app.sign_in === 'no') return 'People don\'t sign in to this app: skip identify.';
  return 'Nobody said whether people sign in: look at the code, and if they do, add the identify call in step 3.';
}

export async function installGuide(conn, app) {
  if (app.platform === 'ios' || app.platform === 'macos') {
    const g = await guide(conn, 'install-apple');
    return [
      `App: ${app.name} (${app.id}), platform ${app.platform}. Key: ${app.key}`,
      signInLine(app),
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
    signInLine(app),
    '',
    `The tag for this app:\n\n    ${tag}`,
    '',
    g.text.replaceAll('SDK_URL', sdk).replaceAll('KEY', app.key),
  ].join('\n');
}

// ---- install verification ------------------------------------------------------------------

// Build output, dependencies and caches: never where someone wrote the tag.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'DerivedData', 'Pods', 'vendor', 'coverage']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.pdf', '.zip', '.gz', '.tgz',
  '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov', '.mp3', '.wav', '.a', '.o', '.dylib', '.so', '.exe',
  '.jar', '.class', '.wasm', '.car', '.sqlite', '.db', '.lock']);
const MAX_FILE = 1024 * 1024;
const MAX_FILES = 20_000;

/**
 * The first file in the repo that contains the app's key, relative to the root, or null.
 * Skips dot-folders, dependencies and build output, and gives up after MAX_FILES so a huge
 * repo can't hang the agent.
 */
export function findKeyInRepo(root, key) {
  if (!key) return null;
  const needle = Buffer.from(key);
  let scanned = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!e.isFile() || BINARY.has(extname(e.name).toLowerCase())) continue;
      if (++scanned > MAX_FILES) return null;
      let buf;
      try {
        if (statSync(full).size > MAX_FILE) continue;
        buf = readFileSync(full);
      } catch { continue; }
      if (buf.includes(0)) continue; // binary
      if (buf.includes(needle)) return relative(root, full).split(sep).join('/');
    }
  }
  return null;
}

/** An app connected to this repo, by id or name. `how` says where to look them up. */
export async function findApp(api, id, how = 'Run: heresay apps') {
  const app = (await api.apps()).apps.find((a) => a.id === id || a.name.toLowerCase() === String(id).toLowerCase());
  if (!app) throw new HeresayError(`No app "${id}" is connected to this repo. ${how}`, 404);
  return app;
}

const apple = (app) => app.platform === 'ios' || app.platform === 'macos';

/**
 * Is Heresay installed in this app? Two separate proofs: the key is in this repo's code
 * (found here, and recorded on the server), and the SDK has been seen running. Used by both
 * `heresay check` and the check_install tool. Never returns report text.
 */
export async function verifyInstall(api, app, { wait = 0, root = repoAt().root } = {}) {
  const file = findKeyInRepo(root, app.key);
  if (file) await api.verify(app.id, file);
  const until = Date.now() + Number(wait || 0) * 1000;
  let r = await api.check(app.id);
  while (!r.installed && Date.now() < until) {
    await new Promise((res) => setTimeout(res, 4000));
    r = await api.check(app.id);
  }
  const out = {
    installed: Boolean(r.installed),
    found_in_code: file,               // in this repo, just now
    seen_running: r.sdk_seen ?? null,  // the SDK loaded in the running app
    code_found: r.code_found ?? null,  // the last time any connected repo proved it
    reports: r.reports,
    first: r.first,
    framework: r.framework,
    framework_detected: r.framework_detected,
  };
  if (!file && !out.seen_running) {
    out.hint = apple(app)
      ? `The key isn't in this repo's code yet. Add the Swift package and call Heresay.configure(key: "${app.key}", url: …) once in the App's init; see \`heresay install ${app.id}\`.`
      : `The key isn't in this repo's code yet; add the tag from \`heresay install ${app.id}\`.`;
  } else if (!out.seen_running) {
    out.hint = apple(app)
      ? 'The key is in the code. Build and run the app once so the SDK is seen running, then check again.'
      : 'The key is in the code. Open the app in a browser once so the SDK is seen running, then check again.';
  }
  return out;
}
