// Bundles what a Heresay deploys (dashboard, SDK, API, database rules) into
// packages/create-heresay/release/, which the CLI copies and deploys. Run before testing or
// publishing the CLI:  node scripts/build-release.mjs
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const out = `${root}packages/create-heresay/release/`;
const version = /VERSION = '([^']+)'/.exec(readFileSync(`${root}functions/src/core/version.ts`, 'utf8'))[1];

execSync('npm run build', { cwd: `${root}functions`, stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}functions`, { recursive: true });
cpSync(`${root}public`, `${out}public`, { recursive: true });
cpSync(`${root}functions/lib`, `${out}functions/lib`, { recursive: true, filter: (f) => !f.endsWith('.map') });
for (const f of ['package.json', 'package-lock.json']) cpSync(`${root}functions/${f}`, `${out}functions/${f}`);
for (const f of ['firebase.json', 'firestore.rules', 'firestore.indexes.json']) cpSync(`${root}${f}`, `${out}${f}`);
writeFileSync(`${out}VERSION`, version + '\n');
console.log(`release ${version} -> ${out}`);
