# Heresay

People using your app can report something from inside it: broken, confusing, could be better,
or an idea. You get each report with the screen, app version and device attached, accept or
decline it (a decline needs a reason), and the reporter sees the outcome in the app.

## Setup

Every team runs its own Heresay, in its own Google account:

```sh
npx create-heresay
```

It signs you in to Google, creates a Firebase project, links billing (Cloud Functions needs the
Blaze plan; a small app stays in the free tier), deploys the dashboard, API and SDK, and makes
you the owner. About five minutes. Then open the dashboard, add an app, and paste the line it
gives you:

```html
<script src="https://<your-heresay>.web.app/sdk/v1.js" data-key="pk_..." defer></script>
```

Later: `npx create-heresay update` deploys a new version, `status` shows what's where, `remove`
deletes a Heresay. The setup UX is specified in `docs/plan/cli-ux.md`; the code is
`packages/create-heresay/`.

## Coding agents

In an app's repo, `npx heresay connect` links it to its apps: it adds `.mcp.json` (the MCP
server), a short skill and an `AGENTS.md` section, and keeps the repo's token in `~/.heresay`.
Agents then install Heresay ("Add Heresay to this app") and fix accepted reports ("Fix the next
Heresay report"). They never see open reports and never accept or decline. Code:
`packages/heresay/`; guides the agent fetches live: `public/guides/`; server side:
`functions/src/core/agent.ts`.

## How it fits together

One Firebase project per team, one origin:

| Path | What |
| --- | --- |
| `/sdk/v1.js` | The web SDK (also at `/sdk.js`). Plain JS, shadow DOM, no dependencies. `public/sdk.js` |
| `/` | Redirects to `/app/`, with a link to the product page. `public/index.html` |
| `/docs.html` | Developer docs. `public/docs.html`, `public/site.css` |
| `/app/` | The developer dashboard. `public/app/index.html`, `public/dashboard.js` |
| `/v1/**` | The `api` Cloud Function. Logic in `functions/src/core/`, Firebase adapter in `functions/src/providers/firebase/` |

Firestore rules deny all client access; everything goes through the function. Dashboard access is
by verified email: the team lives in `meta/instance`, and `create-heresay` writes the first owner.

## Develop

```sh
npm install && npm --prefix functions install
npm test        # handler logic, in memory
npm run e2e     # the whole loop in a real browser against the emulators
npm run e2e:agent  # heresay connect + the MCP server driving an app from install to fixed
npm run dev     # emulators; site at http://127.0.0.1:5055, dashboard at /app/, demo host app at /demo.html?key=pk_...
```

Emulator ports are non-default (auth 9199, firestore 8181, functions 5101, hosting 5055, UI 4100)
so this can run next to other Firebase projects on the same machine.

## Release

`node scripts/build-release.mjs` bundles `public/`, the built API and the Firestore config into
`packages/create-heresay/release/`, which is what the CLI deploys. Bump
`functions/src/core/version.ts` for a new version. To try the CLI from a checkout, before it is
on npm: `node packages/create-heresay/bin/create-heresay.mjs`.

The Swift package lives in `apple/` and is published by copying that folder to the public
repo `github.com/Sibhimanyu/heresay-swift` and tagging it with the version (SwiftPM installs
from tags).

npm publishing is automatic: merging a release PR that bumps `packages/*/package.json` runs
`.github/workflows/release.yml`, which tests, builds and publishes any version not on npm yet,
authenticated by npm trusted publishing (no token, no passkey). Then `create-heresay update`
deploys the new version to an instance.

## Product page

The marketing page lives at https://sibhimanyu.github.io/heresay/, not on instances. Source:
`site/` (static, relative links, a copy of the docs page with `https://<your-heresay>.web.app`
in place of the instance address). Merging a change to `site/` deploys it
(`.github/workflows/pages.yml`). When `public/docs.html` changes, copy the change into
`site/docs.html` too.

## What's next

Open work, unverified bits and housekeeping: `docs/plan/next.md`.

## Brand

Guidelines: `brand/heresay-brand-guidelines.ai` (Illustrator, 14 artboards) and `.pdf`. Logo files: `brand/ai/` and `brand/svg/`. Rebuild the .ai files with `scripts/illustrator_build_guidelines.jsx` and `scripts/illustrator_save_logos.jsx` (paths inside are absolute; adjust before running). Source of truth: `scripts/brand_geometry.py`. See `docs/decisions/0003-brand-system.md`.
