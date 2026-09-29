/**
 * Runs the Firebase tools that ship inside this package, pinned to one version. Nothing is
 * installed globally, and a Firebase CLI the user already has is left alone.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const BIN = require.resolve('firebase-tools/lib/bin/firebase.js');

let logFile = null;
export function logTo(path) { logFile = path; }
export function log(line) { if (logFile) appendFileSync(logFile, line.endsWith('\n') ? line : line + '\n'); }

/**
 * Run `firebase <args>`. Output goes to the log file; `interactive` hands the terminal over
 * instead (for the browser login).
 */
export function firebase(args, { cwd, interactive = false, onLine, secret = false } = {}) {
  log(`\n$ firebase ${args.join(' ')}${cwd ? `   (in ${cwd})` : ''}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd, stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', CI: interactive ? process.env.CI : '1' },
    });
    let out = '';
    const take = (d) => {
      const s = d.toString();
      out += s;
      if (!secret) log(s);
      if (onLine) for (const line of s.split('\n')) if (line.trim()) onLine(line.trim());
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    child.on('close', (code) => resolve({ code, out }));
  });
}

/** Run a command with --json and return its `result`, or null if it failed. */
export async function firebaseJson(args, opts) {
  const { code, out } = await firebase([...args, '--json'], opts);
  try {
    const start = out.indexOf('{');
    const b = JSON.parse(out.slice(start));
    return b.status === 'success' ? b.result : (code === 0 ? b.result : null);
  } catch { return null; }
}

/** npm, for installing the API's runtime dependencies before deploy. */
export function npm(args, { cwd } = {}) {
  log(`\n$ npm ${args.join(' ')}   (in ${cwd})`);
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let out = '';
    child.stdout.on('data', (d) => { out += d; log(d.toString()); });
    child.stderr.on('data', (d) => { out += d; log(d.toString()); });
    child.on('close', (code) => resolve({ code, out }));
    child.on('error', (e) => resolve({ code: 1, out: String(e) }));
  });
}
