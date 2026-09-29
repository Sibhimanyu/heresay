/** ~/.heresay/config.json: every Heresay this computer has set up, and how far each got. */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

export const HOME = process.env.HERESAY_HOME || join(homedir(), '.heresay');
const FILE = join(HOME, 'config.json');

export function load() {
  if (!existsSync(FILE)) return { instances: {} };
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return { instances: {} }; }
}

export function save(state) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2) + '\n');
}

/** Merge `patch` into one instance's record and write it straight away. */
export function update(id, patch) {
  const s = load();
  s.instances[id] = { ...(s.instances[id] ?? {}), ...patch, updated_at: new Date().toISOString() };
  save(s);
  return s.instances[id];
}

export function markDone(id, step) {
  const cur = load().instances[id] ?? {};
  return update(id, { done: { ...(cur.done ?? {}), [step]: true } });
}

export function forget(id) {
  const s = load();
  delete s.instances[id];
  save(s);
}

export function logPath(id) {
  mkdirSync(join(HOME, 'logs'), { recursive: true });
  return join(HOME, 'logs', `${id}.log`);
}

export function workDir(id) { return join(HOME, 'instances', id); }
