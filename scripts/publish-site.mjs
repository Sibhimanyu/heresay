#!/usr/bin/env node
// Publishes site/ (the Heresay product page) to the public repo github.com/Sibhimanyu/heresay,
// which GitHub Pages serves at https://sibhimanyu.github.io/heresay/.
// Clones the repo into a temp dir, replaces everything but .git with site/, commits and pushes.
// Usage: node scripts/publish-site.mjs ["commit message"]
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Sibhimanyu/heresay';
const BRANCH = 'main';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const out = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const source = out('git', ['rev-parse', '--short', 'HEAD'], root);
const message = process.argv[2] || `Publish site from agentic-feedback-sdk@${source}`;
const tmp = mkdtempSync(join(tmpdir(), 'heresay-site-'));

try {
  run('gh', ['repo', 'clone', REPO, tmp]);
  // A brand-new repo has no commits yet; make sure we are on the Pages branch either way.
  run('git', ['checkout', '-B', BRANCH], tmp);
  for (const f of readdirSync(tmp)) if (f !== '.git') rmSync(join(tmp, f), { recursive: true, force: true });
  cpSync(site, tmp, { recursive: true });
  run('git', ['add', '-A'], tmp);
  if (!out('git', ['status', '--porcelain'], tmp)) {
    console.log('Site is already up to date.');
  } else {
    run('git', ['commit', '-m', message], tmp);
    run('git', ['push', 'origin', BRANCH], tmp);
    console.log(`Published to https://github.com/${REPO} (${BRANCH}). Live at https://sibhimanyu.github.io/heresay/`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
