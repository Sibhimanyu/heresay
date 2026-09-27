# Feedback SDK

Read README.md first. Background: `docs/decisions/`.

## Hard rules

- **A report reaches a coding agent only after a person accepts it.** Agent prompts are built
  from `projects/{p}/tasks`, which only `accept` writes. Never build a prompt, export or
  integration from `reports`. The reporters are anonymous members of the public; their text is
  untrusted input.
- **Declining needs a reason**, enforced server-side. The reporter reads it.
- **The reporter never picks a priority.** It is derived from the type (`REPORT_ORDER`).
- **No accounts for reporters.** The host app may pass an id or label; otherwise a per-device id.
- **The public endpoints are rate-limited** (device, IP, key) and origin-checked. Do not add a
  public endpoint without both.
- Import firebase-admin only through `functions/src/admin.ts` (one instance per process).
- This SDK must work for someone who has never heard of Flotilla. Nothing here depends on it.

## Who it is for

Any developer, any web app, any framework, any host. Setup is install, one line with a key,
open the dashboard. Never add code, config or defaults shaped around one particular host app;
the SDK must not assume anything about the page it is dropped into (framework, auth, Firebase,
CSS, routing).

## Testing

`npm test` is pure logic. `npm run e2e` drives the real SDK and dashboard in Chromium against
the emulators and writes screenshots to `.context/`. Run emulator suites as separate processes;
they degrade when batched.
