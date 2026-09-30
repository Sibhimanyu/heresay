// Cut a release PR in one step:  node scripts/release.mjs 0.2.10
// Bumps the Heresay version and create-heresay to it, bumps heresay (the agent package) by a patch
// if its code changed since its last release, updates docs/plan/next.md, builds, tests, commits
// on release-<version>, pushes and opens the PR. Merging it publishes, deploys and tags
// (.github/workflows/release.yml).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) { console.error('Usage: node scripts/release.mjs <x.y.z>'); process.exit(2); }

const json = (p) => JSON.parse(readFileSync(`${root}${p}`, 'utf8'));
const write = (p, j) => writeFileSync(`${root}${p}`, JSON.stringify(j, null, 2) + '\n');

run('git', ['fetch', '-q', 'origin']);
if (out('git', ['status', '--porcelain', '--untracked-files=no'])) { console.error('Commit or stash your changes first.'); process.exit(1); }
run('git', ['checkout', '-q', '-B', `release-${version}`, 'origin/master']);

const vfile = 'functions/src/core/version.ts';
writeFileSync(`${root}${vfile}`, readFileSync(`${root}${vfile}`, 'utf8').replace(/'\d+\.\d+\.\d+'/, `'${version}'`));
const ch = json('packages/create-heresay/package.json'); ch.version = version; write('packages/create-heresay/package.json', ch);

// heresay has its own numbers: bump it only if its code changed since the version npm has.
const h = json('packages/heresay/package.json');
let published = null;
try { published = out('npm', ['view', 'heresay', 'version']); } catch { /* offline */ }
const lastTag = out('git', ['log', '-1', '--format=%H', `--grep=Release`, '--', 'packages/heresay/package.json']);
const changed = lastTag && out('git', ['diff', '--name-only', lastTag, 'HEAD', '--', 'packages/heresay/src', 'packages/heresay/bin']);
if (published === h.version && changed) {
  const [a, b, c] = h.version.split('.').map(Number); h.version = `${a}.${b}.${c + 1}`; write('packages/heresay/package.json', h);
}

const plan = 'docs/plan/next.md';
writeFileSync(`${root}${plan}`, readFileSync(`${root}${plan}`, 'utf8')
  .replace(/Live: Heresay [\d.]+/, `Live: Heresay ${version}`)
  .replace(/`create-heresay` [\d.]+/, `\`create-heresay\` ${version}`)
  .replace(/`heresay` [\d.]+/, `\`heresay\` ${h.version}`));

run('node', ['scripts/build-release.mjs']);
run('npm', ['test']);
run('git', ['add', vfile, 'packages/create-heresay/package.json', 'packages/heresay/package.json', plan]);
run('git', ['commit', '-qm', `Release ${version}\n\nCo-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`]);
run('git', ['push', '-q', '-u', 'origin', `release-${version}`]);
const body = `Heresay ${version}: create-heresay ${version}, heresay ${h.version}.\n\nMerging this publishes to npm, deploys the instance and tags the Swift package if \`apple/\` changed (\`.github/workflows/release.yml\`).\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n`;
writeFileSync('/tmp/heresay-release-body.md', body);
run('gh', ['pr', 'create', '--base', 'master', '--title', `Release ${version}`, '--body-file', '/tmp/heresay-release-body.md']);
