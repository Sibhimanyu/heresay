# What's outstanding

As of 2026-09-29. Live: Heresay 0.2.8 at https://heresay-sibhi-42b1.web.app. npm:
`create-heresay` 0.2.8, `heresay` 0.2.5. Swift: `github.com/Sibhimanyu/heresay-swift` 0.2.7.
Product page: https://sibhimanyu.github.io/heresay/ (from `site/`, published with
`node scripts/publish-site.mjs`).

## To build

- **Android, React Native, Flutter SDKs.** The wizard shows them as "Soon". Same `/v1` API
  as web and Swift: POST `/v1/reports` and `/v1/reports/mine` with `key`, `device_id`, `sdk`,
  and context. Each needs its install steps in the wizard, an `install-<platform>` guide, and
  a branch in `installGuide()` in `packages/heresay/src/client.mjs`.
- **Catalyst as a second backend** (decision 0004). This needs a `providers/catalyst/` adapter
  that passes `functions/test/store-contract.ts`, and a provider module in `create-heresay`.

## Not verified yet

- **A real sign-in on a live instance.** Google reaches Google's sign-in page and email links
  are switched on, but no one has finished either on `heresay-sibhi-42b1`.
- **The one-prompt install through a real coding agent.** `npm run e2e:agent` runs the same
  commands against the emulators, but no agent has been given the copied prompt against the
  live instance.
- **The MCP server from npm.** `npx heresay@0 mcp` was only run locally. `heresay help`
  from npm works.
- **The macOS report window by eye.** The iOS screens were checked in the simulator. macOS
  was covered by tests and a build only.
- **`findKeyInRepo` / `verifyInstall` against a live server.** They were tested against the
  emulators and a fake server.

## Known gaps

- **Binding a prompt token isn't transactional.** Two repos that connect with the same prompt
  token at the same moment could both bind (`agent.ts`, bind). It's rare and the fix is small:
  a transactional `updateAgentToken`.
- **Repos connected before 0.2.9 still pin `heresay@0`** in `.mcp.json`. `connect` now writes
  `heresay@latest`, and the MCP server says when it's behind, including how to fix an old pin
  (`npx -y heresay@latest connect --update`).
- **Deleting an app leaves tokens behind.** A token whose only app was deleted stays, with no
  apps. It's harmless, but it shows in Connected repos until someone revokes it.
- **Upstream warnings.** The functions emulator warns that `firebase-functions` is outdated,
  and `firebase-tools` pulls in deprecated packages (`glob@10`, `uuid@9`). Upgrade when
  convenient and re-run all suites.

## Housekeeping

- **This computer is signed in** to Firebase as sibhi.gv@gmail.com (used to set up and update
  the instance) and to npm as `sibhimanyu`. Run `npx firebase logout` / `npm logout` if that's
  not wanted.
- **The old project `feedback-sdk-live`** is in "delete requested" with billing unlinked. Its
  static pages can load until Google purges it, around 2026-10-29. Nothing to do.
- **Releasing** means:
  1. Bump `functions/src/core/version.ts` and the package versions.
  2. Run `node scripts/build-release.mjs`.
  3. Publish with `npx npm@11 publish --auth-type=web`; npm asks for the passkey.
  4. Update the instance with `create-heresay update`.
  5. For Swift, copy `apple/` to `heresay-swift` and add a tag.
- **Connectors.** Several Claude connectors aren't authorised (Asana, Notion, Linear, Zoho
  Projects, and others), and the Illustrator and Paper tools didn't connect. None of that
  affects Heresay.

## Tests to run before any release

```sh
npm test                 # unit + store contract (MemoryStore)
npm run test:firestore   # store contract on the Firestore emulator
npm run e2e              # dashboard + web SDK in Chromium
npm run e2e:agent        # heresay connect + MCP server, install to fixed
npm run e2e:apple        # real reports from macOS and the iOS simulator
```

Run the emulator suites one at a time.
