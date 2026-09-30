// Publish each package whose version isn't on npm yet. Run by .github/workflows/release.yml,
// where npm trusted publishing authenticates it; locally it needs `npm login` and a passkey.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
for (const dir of ['packages/create-heresay', 'packages/heresay']) {
  const { name, version } = JSON.parse(readFileSync(`${root}${dir}/package.json`, 'utf8'));
  let there = false;
  try { there = execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' }).trim() === version; } catch { /* not published */ }
  if (there) { console.log(`${name}@${version} is already on npm; skipping.`); continue; }
  console.log(`Publishing ${name}@${version}…`);
  execFileSync('npm', ['publish', '--access', 'public'], { cwd: `${root}${dir}`, stdio: 'inherit' });
}
