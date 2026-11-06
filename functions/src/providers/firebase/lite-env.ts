/**
 * Imported first by node-server.ts, so it runs before firebase-admin starts. Hosts that hand
 * secrets over as environment variables (not files) pass the service-account key as
 * GOOGLE_APPLICATION_CREDENTIALS_JSON; firebase-admin only reads a path, so write it to one.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (json && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  JSON.parse(json); // fail at start with a clear error, not on the first request
  const path = join(tmpdir(), 'heresay-service-account.json');
  writeFileSync(path, json, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
}
