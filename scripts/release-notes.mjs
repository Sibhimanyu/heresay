// Release notes live in public/guides/releases.json. A release can't be cut without an entry
// there, and CHANGELOG.md and apple/CHANGELOG.md (shipped in the Swift package) are generated
// from it:  node scripts/release-notes.mjs   (also run by scripts/release.mjs)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const RELEASES = 'public/guides/releases.json';

const cmp = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

/** The entry for `version`, or throws an Error saying what to write. */
export function checkRelease(releases, version) {
  const entry = (releases?.versions ?? []).find((v) => v.version === version);
  const fix = `Add { "version": "${version}", "users": [...], "developers": [...] } to ${RELEASES}: what the people using the app will see, and what developers can now do or must change.`;
  if (!entry) throw new Error(`No release notes for ${version}. ${fix}`);
  if (!Array.isArray(entry.users) || !Array.isArray(entry.developers) || !(entry.users.length || entry.developers.length)) {
    throw new Error(`The notes for ${version} are empty. ${fix}`);
  }
  return entry;
}

/** One changelog section. A release without a date yet reads "Unreleased". */
export function renderEntry(v) {
  const part = (title, items) => (items?.length ? `### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n\n` : '');
  return `## [${v.version}] - ${v.date ?? 'Unreleased'}\n\n` +
    part('What the people using your app see', v.users) + part('For developers', v.developers) +
    (v.action ? `### Action needed\n\n- ${v.action}\n\n` : '');
}

/** The root changelog: every release in releases.json, then the older sections already there. */
export function renderChangelog(releases, existing = '') {
  const have = new Set(releases.versions.map((v) => v.version));
  const old = existing.split(/\n(?=## \[)/).slice(1).map((s) => s.trimEnd() + '\n')
    .filter((s) => !have.has(/^## \[([^\]]+)\]/.exec(s)?.[1]));
  const fresh = [...releases.versions].sort((a, b) => cmp(b.version, a.version)).map(renderEntry);
  return '# Changelog\n\n' + [...fresh.map((s) => s.trimEnd() + '\n'), ...old].join('\n');
}

/** apple/CHANGELOG.md: the same notes, for whoever updates the Swift package. */
export function renderAppleChangelog(releases) {
  const intro = '# Heresay for Apple: changelog\n\nWhat changed in each release, for the people using your app and for you. Updating? Do what "Action needed" says, if anything shows.\n\n';
  return intro + [...releases.versions].sort((a, b) => cmp(b.version, a.version)).map((v) => renderEntry(v).trimEnd() + '\n').join('\n');
}

export function readReleases() { return JSON.parse(readFileSync(`${root}${RELEASES}`, 'utf8')); }

/** Stamp today's date on `version` if it has none, then rewrite both changelogs. Returns the files. */
export function writeChangelogs(version, today = new Date().toISOString().slice(0, 10)) {
  const releases = readReleases();
  const entry = checkRelease(releases, version);
  if (!entry.date) { entry.date = today; writeFileSync(`${root}${RELEASES}`, JSON.stringify(releases, null, 2) + '\n'); }
  let existing = '';
  try { existing = readFileSync(`${root}CHANGELOG.md`, 'utf8'); } catch { /* none yet */ }
  writeFileSync(`${root}CHANGELOG.md`, renderChangelog(releases, existing));
  writeFileSync(`${root}apple/CHANGELOG.md`, renderAppleChangelog(releases));
  return [RELEASES, 'CHANGELOG.md', 'apple/CHANGELOG.md'];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const releases = readReleases();
  let existing = '';
  try { existing = readFileSync(`${root}CHANGELOG.md`, 'utf8'); } catch { /* none yet */ }
  writeFileSync(`${root}CHANGELOG.md`, renderChangelog(releases, existing));
  writeFileSync(`${root}apple/CHANGELOG.md`, renderAppleChangelog(releases));
  console.log('Wrote CHANGELOG.md and apple/CHANGELOG.md from', RELEASES);
}
