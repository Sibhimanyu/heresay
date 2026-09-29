#!/usr/bin/env node
// Checked before anything is imported, so an old Node gets a sentence instead of a syntax error.
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`Heresay needs Node 20 or newer. You have ${process.versions.node}. Install it from https://nodejs.org, then run this again.`);
  process.exit(1);
}
const { main } = await import('../src/cli.mjs');
await main(process.argv.slice(2));
