/**
 * Updates for a repo that has Heresay: newer versions of what it runs, and features it doesn't
 * use yet. Read by the whats_new tool, `heresay updates`, and the session-start hook that
 * `heresay connect` adds, so an agent brings them up in any chat in the repo, not only in a
 * Heresay task. Nothing is ever applied here; the agent asks the person first.
 *
 *   instance@x.y.z   the Heresay itself (dashboard, API and the web Report button) is behind
 *   swift@x.y.z      the Swift package pinned in Package.resolved is behind
 *   agent-files@N    the skill, AGENTS.md section, MCP entry or hook here are from an older heresay
 *   <feature id>     a feature from the Heresay's changes.json the app doesn't use yet
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DECISIONS, HOME, SKILL_VERSION, client, connection, repoAt, repoSkillVersion, whatsNew } from './client.mjs';

/** a.b.c > x.y.z, numerically. Anything unparseable is never "newer". */
export function newer(a, b) {
  const p = (v) => String(v ?? '').replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [x, y] = [p(a), p(b)];
  if (x.length !== 3 || x.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > (y[i] || 0);
  return false;
}

const registry = () => (process.env.HERESAY_REGISTRY ?? 'https://registry.npmjs.org').replace(/\/+$/, '');

async function latestOnNpm(pkg) {
  try {
    const r = await fetch(`${registry()}/${pkg}/latest`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? (await r.json()).version ?? null : null;
  } catch { return null; }
}

async function instanceVersion(url) {
  try {
    const r = await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? (await r.json()).version ?? null : null;
  } catch { return null; }
}

// ---- release notes ---------------------------------------------------------------------------

const RELEASES_FALLBACK = 'https://raw.githubusercontent.com/Sibhimanyu/heresay/master/public/guides/releases.json';

/**
 * releases.json: from this team's Heresay, and from the project's repo when the Heresay is behind
 * the version being described (it can't know about releases newer than itself).
 */
export async function loadReleases(conn, upTo) {
  const get = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      return r.ok ? (await r.json()).versions ?? [] : [];
    } catch { return []; }
  };
  let versions = conn ? await get(`${conn.url}/guides/releases.json`) : [];
  if (!versions.some((v) => !newer(upTo, v.version))) versions = await get(process.env.HERESAY_RELEASES_URL ?? RELEASES_FALLBACK);
  return versions;
}

/** The releases after `from`, up to and including `to`, oldest first. */
export function releasesBetween(versions, from, to) {
  return versions
    .filter((v) => newer(v.version, from) && !newer(v.version, to))
    .sort((a, b) => (newer(a.version, b.version) ? 1 : -1));
}

/** Compact notes for the agent to explain: only what each release has to say. */
export function notesFor(releases) {
  return releases.map((r) => ({
    version: r.version,
    ...(r.users?.length ? { users: r.users } : {}),
    ...(r.developers?.length ? { developers: r.developers } : {}),
    ...(r.action ? { action: r.action } : {}),
  })).filter((n) => Object.keys(n).length > 1);
}

/** Ids of the features those releases introduced that fit this app (applicable, not in yet, not skipped). */
export function thenFor(releases, features, platforms) {
  const introduced = new Set(releases.flatMap((r) => r.features ?? []));
  return features.filter((f) => introduced.has(f.id) && f.platforms.some((p) => platforms.includes(p))).map((f) => f.id);
}

// ---- the Swift package -----------------------------------------------------------------------

/**
 * Every Package.resolved in the repo with a heresay-swift pin: SwiftPM's at the root, and Xcode's
 * inside .xcodeproj and .xcworkspace bundles. { file, version, location }.
 */
export function swiftPins(root) {
  const out = [];
  const look = (file) => {
    let j;
    try { j = JSON.parse(readFileSync(file, 'utf8')); } catch { return; }
    const pins = j.pins ?? j.object?.pins ?? [];
    for (const p of pins) {
      const where = p.location ?? p.repositoryURL ?? '';
      if (!/heresay-swift/i.test(where) && !/^heresay(-swift)?$/i.test(p.identity ?? p.package ?? '')) continue;
      const version = p.state?.version;
      if (version) out.push({ file: relative(root, file).split(sep).join('/'), version, location: where });
    }
  };
  const stack = [[root, 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isFile() && e.name === 'Package.resolved') look(full);
      // Into Xcode bundles (they start with a name, not a dot); out of dependencies and builds.
      if (e.isDirectory() && depth < 6 && !/^(node_modules|\.git|\.build|build|DerivedData|Pods|Carthage|vendor|dist)$/.test(e.name)
        && (!e.name.startsWith('.') || e.name === '.swiftpm')) stack.push([full, depth + 1]);
    }
  }
  return out;
}

/** The newest x.y.z tag of the Swift package's repo, from git (no API limits). */
export function latestSwiftTag(location) {
  if (process.env.HERESAY_SWIFT_LATEST) return process.env.HERESAY_SWIFT_LATEST;
  try {
    const out = execFileSync('git', ['ls-remote', '--tags', '--refs', location], { timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const tags = [...out.matchAll(/refs\/tags\/v?(\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);
    return tags.reduce((best, t) => (!best || newer(t, best) ? t : best), null);
  } catch { return null; }
}

// ---- the agent files -------------------------------------------------------------------------

export const HOOK_COMMAND = 'npx -y heresay@latest updates --hook';

/** Is everything `heresay connect` writes here from this version? Lists what's old. */
export function staleAgentFiles(root) {
  const old = [];
  const skill = repoSkillVersion(root);
  if (skill != null && skill < SKILL_VERSION) old.push(`the /heresay skill (version ${skill}, now ${SKILL_VERSION})`);
  try {
    const args = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers?.heresay?.args ?? [];
    if (args.length && !args.includes('heresay@latest')) old.push(`.mcp.json (runs ${args.find((a) => /^heresay@/.test(a)) ?? 'an old heresay'})`);
  } catch { /* no .mcp.json */ }
  if (skill != null && !hasHook(root)) old.push('the session-start check in .claude/settings.json');
  return old;
}

export function hasHook(root) {
  try {
    const s = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8'));
    return (s.hooks?.SessionStart ?? []).some((m) => (m.hooks ?? []).some((h) => String(h.command ?? '').includes('heresay@latest updates')));
  } catch { return false; }
}

// ---- all of it -------------------------------------------------------------------------------

function skippedIds(root) {
  try { return JSON.parse(readFileSync(join(root, DECISIONS), 'utf8')).skipped ?? {}; } catch { return {}; }
}

/** notes and then for a version update from `from` to `to`; nothing when there are no notes. */
async function withNotes(conn, from, to, features, platforms) {
  const releases = releasesBetween(await loadReleases(conn, to), from, to);
  const notes = notesFor(releases);
  const then = thenFor(releases, features, platforms);
  return { ...(notes.length ? { notes } : {}), ...(then.length ? { then } : {}) };
}

/**
 * Version updates for this repo. `conn` may be null (a teammate who hasn't connected yet): then
 * the Heresay's own version can't be checked, and the rest still can.
 */
export async function versionUpdates(conn, apps, { root = repoAt().root, features = [] } = {}) {
  const ups = [];
  const [have, latest] = conn ? await Promise.all([instanceVersion(conn.url), latestOnNpm('create-heresay')]) : [null, null];
  if (have && latest && newer(latest, have)) {
    ups.push({
      id: `instance@${latest}`, kind: 'version', since: latest,
      title: `Update this team's Heresay from ${have} to ${latest}`,
      summary: `The dashboard, the API and the web Report button (served by the Heresay, so every web app gets it with no code change) are on ${have}. If notes lists changes, describe them to the person before applying: the web Report button their users see may change.`,
      ...await withNotes(conn, have, latest, features, ['web']),
      how: 'Whoever set this Heresay up runs `npx create-heresay update` on their computer (it signs in to Google with their account). If that is the person you are talking to and they say yes, run it for them; otherwise tell them who needs to.',
    });
  }
  const pins = swiftPins(root);
  const where = pins[0]?.location || 'https://github.com/Sibhimanyu/heresay-swift';
  const swift = pins.length ? latestSwiftTag(where) : null;
  const behind = swift ? pins.filter((p) => newer(swift, p.version)) : [];
  if (behind.length) {
    const xcode = behind.filter((p) => /\.xc(odeproj|workspace)\//.test(p.file));
    ups.push({
      id: `swift@${swift}`, kind: 'version', since: swift,
      title: `Update the Heresay Swift package from ${behind[0].version} to ${swift}`,
      summary: `Pinned in ${behind.map((p) => p.file).join(', ')}. If notes lists changes, describe them to the person before applying: the Report panel their users see may change.`,
      ...await withNotes(conn, behind.map((p) => p.version).reduce((m, v) => (newer(m, v) ? v : m)), swift, features, ['ios', 'macos']),
      how: (xcode.length
        ? `Xcode: File › Packages › Update to Latest Package Versions. From a terminal: remove the heresay-swift pin from ${xcode.map((p) => p.file).join(', ')} and run \`xcodebuild -resolvePackageDependencies\` for that project (the pin comes back at the newest version the project allows). `
        : 'Run `swift package update heresay-swift` in the package. ') +
        'Then build, and commit Package.resolved. If the project pins an exact version or a range below it, raise that first. Then do what notes.action says, if anything, and offer `then`.',
    });
  }
  const old = staleAgentFiles(root);
  if (old.length) {
    ups.push({
      id: `agent-files@${SKILL_VERSION}`, kind: 'version', since: String(SKILL_VERSION),
      title: 'Refresh Heresay\'s agent files in this repo',
      summary: `Older than this heresay: ${old.join('; ')}. The new ones have the current rules and check for updates when a chat starts.`,
      how: 'Run `npx -y heresay@latest connect --update`, then commit the files it lists, in their own commit.',
    });
  }
  return ups;
}

/**
 * Version updates, then features, minus anything the team said no to. A feature with offer
 * "optional" is offered only right after a version update that introduced it (its id is in that
 * update's `then`), never on its own.
 */
export async function allUpdates(conn = connection(), { root = repoAt().root } = {}) {
  let apps = [];
  let features = [];
  if (conn) {
    try {
      apps = (await client(conn).apps()).apps;
      features = (await whatsNew(conn, apps, { root })).updates;
    } catch { /* offline, or a revoked token: versions only */ }
  }
  const skipped = skippedIds(root);
  const versions = (await versionUpdates(conn, apps, { root, features })).filter((u) => !skipped[u.id]);
  const chained = new Set(versions.flatMap((u) => u.then ?? []));
  const offered = features.filter((f) => f.offer !== 'optional' || chained.has(f.id))
    .map(({ platforms, ...f }) => ({ ...f, ...(chained.has(f.id) ? { after: 'a version update above' } : {}) }));
  const updates = [...versions, ...offered.map((f) => ({ kind: 'feature', ...f }))].filter((u) => !skipped[u.id]);
  return {
    updates,
    ...(updates.length ? { ask_first: ASK } : {}),
  };
}

const ASK = 'Do not apply anything yet. For each item tell the person in plain words: what the app\'s users will see, what code changes, ' +
  'and your own recommendation for THIS app with a reason. A version update that changes what users see (see notes) must be described first, never just bumped. ' +
  'Ask per item: Add it / Not now / Never. Apply nothing without a yes; apply via its guide, run check_install, commit each separately, then show where to see it ' +
  '(screen and click; a screenshot if you can run the app). After a version update, offer the items in its `then`. ' +
  'Never: call skip_update (or `npx heresay updates --skip <id>`) and commit .claude/skills/heresay/decisions.json. Not now: leave it, it is asked again later. Read `npx heresay guide whats-new`.';

// ---- the session-start hook ------------------------------------------------------------------

const SEEN = () => join(HOME, 'update-check.json');
const DAY = 20 * 3600_000;

/**
 * What the hook says when a chat starts: nothing, or context telling the agent to bring the
 * updates up. Once a day per repo on this computer, sooner if a new update appears. Never fails:
 * a hook that errors or hangs would get in the way of every chat.
 */
export async function hookOutput({ root = repoAt().root, now = Date.now() } = {}) {
  let seen = {};
  try { seen = JSON.parse(readFileSync(SEEN(), 'utf8')); } catch { /* first time */ }
  const last = seen[root];
  if (last && now - last.checked < 3600_000) return null; // checked within the hour: stay quick
  const { updates } = await allUpdates(connection(root), { root });
  const ids = updates.map((u) => u.id).sort();
  const fresh = ids.filter((id) => !(last?.mentioned ?? []).includes(id));
  const mention = updates.length && (fresh.length || !last?.mentioned_at || now - last.mentioned_at > DAY);
  seen[root] = { checked: now, mentioned: mention ? ids : last?.mentioned ?? [], mentioned_at: mention ? now : last?.mentioned_at ?? null };
  try { mkdirSync(HOME, { recursive: true, mode: 0o700 }); writeFileSync(SEEN(), JSON.stringify(seen, null, 2) + '\n'); } catch { /* read-only home */ }
  if (!mention) return null;
  const list = updates.map((u, i) => `${i + 1}. [${u.id}] ${u.title}. ${u.summary} How: ${u.how}` +
    (u.notes ? `\n   Changes: ${u.notes.map((n) => `${n.version}: ${[...(n.users ?? []).map((x) => `users see: ${x}`), ...(n.developers ?? []), ...(n.action ? [`action: ${n.action}`] : [])].join(' ')}`).join(' | ')}` : '') +
    (u.then ? `\n   Then offer: ${u.then.join(', ')}` : '')).join('\n');
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: [
        'Heresay (the in-app feedback tool connected to this repo) has updates for it:',
        list,
        '',
        'Bring this up with the person once in this conversation. If their first message is about something else, help with that first and raise it at the end of your reply. ' +
        ASK,
      ].join('\n'),
    },
  };
}
