// Headful macOS integration regression. A standalone app exercises real sheet resizing;
// SwiftPM's XCTest host does not reliably attach SwiftUI sheets or expose accessibility.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (platform() !== 'darwin') throw new Error('This check needs a macOS GUI session.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.context', `sheet-sizing-${Date.now()}`);
const app = join(work, 'SheetSizingProbe.app');
const executable = join(app, 'Contents', 'MacOS', 'SheetSizingProbe');
const result = join(work, 'result.txt');
const cache = join(root, '.context', 'apple-ui-module-cache');
mkdirSync(dirname(executable), { recursive: true });
mkdirSync(cache, { recursive: true });
function run(command, args, timeout) {
  const child = spawnSync(command, args, { cwd: root, stdio: 'inherit', timeout });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${command} exited ${child.status}`);
}
const sources = readdirSync(join(root, 'apple/Sources/Heresay'))
  .filter(name => name.endsWith('.swift')).map(name => join(root, 'apple/Sources/Heresay', name));
run('xcrun', ['swiftc', '-disable-sandbox', '-whole-module-optimization', '-Onone',
  '-target', `${arch() === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos13.0`,
  '-parse-as-library', '-module-cache-path', cache, '-o', executable,
  ...sources, join(root, 'apple/UITests/SheetSizingProbe.swift')], 180_000);
writeFileSync(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SheetSizingProbe</string>
<key>CFBundleIdentifier</key><string>dev.heresay.sheet-sizing-probe</string>
<key>CFBundleName</key><string>SheetSizingProbe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>HeresayProbeResult</key><string>${result.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</string>
</dict></plist>`);
if (process.argv.includes('--build-only')) {
  console.log(app);
  process.exit(0);
}
try {
  run('open', ['-W', '-n', '--env', `HERESAY_PROBE_RESULT=${result}`, app], 30_000);
} catch (error) {
  for (const path of [result, `${result}.phase`]) {
    if (existsSync(path)) console.error(`${path}: ${readFileSync(path, 'utf8')}`);
  }
  throw error;
}
const report = readFileSync(result, 'utf8');
process.stdout.write(report);
if (!report.startsWith('PASS ')) process.exitCode = 1;
