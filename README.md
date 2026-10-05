<p align="center">
  <a href="https://sibhimanyu.github.io/heresay/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="brand/svg/heresay-logo-white.svg">
      <img src="brand/svg/heresay-logo.svg" alt="Heresay" width="320">
    </picture>
  </a>
</p>

<p align="center"><b>Every report gets a hearing.</b><br>
In-app feedback that reaches your coding agent, only after a person says yes.<br>
Made by <a href="https://github.com/Sibhimanyu">Sibhimanyu</a>. Open source, MIT.</p>

<p align="center">
  <a href="https://sibhimanyu.github.io/heresay/">Website</a> ·
  <a href="https://sibhimanyu.github.io/heresay/how-it-works.html">How it works</a> ·
  <a href="https://sibhimanyu.github.io/heresay/docs.html">Docs</a> ·
  <a href="https://www.npmjs.com/package/create-heresay">npm</a>
</p>

# Heresay

People using your app can report something from inside it: broken, confusing, could be better,
or an idea. You get each report with the screen, app version and device attached (and on the
web, what happened just before: pages, clicks, failed requests, errors), accept or
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

The defaults are the recommended look. To fit the app (colour, corner, text, light or dark,
French, Tamil or Hindi, no floating button), open the app in the dashboard and choose
**Design**: it previews the widget and gives the tag, or the Swift for iOS and macOS. Web
options are `data-` attributes (`public/guides/customize-web.md`); Swift takes a `HeresayStyle`
(`public/guides/customize-apple.md`). "Powered by Heresay" always shows. See
`docs/decisions/0006-web-sdk-customisation.md`.

Later: `npx create-heresay update` deploys a new version, `status` shows what's where, `remove`
deletes a Heresay. The setup UX is specified in `docs/plan/cli-ux.md`; the code is
`packages/create-heresay/`.

## Notifications

In the dashboard, open **Notifications** as an owner to connect Telegram, Zoho Cliq, or both.
Settings apply to every app in the instance. Choose alerts for new reports needing review,
accepted reports, reports marked fixed (by a teammate or an agent), and agent handoffs.
Destinations are off until enabled; new reports, fixes, and handoffs are selected by default.

Telegram walks you through it. Make a bot with BotFather and paste its token; the dashboard
checks it. Then choose who gets alerts (**Just me**, **A group** or **A channel**) and follow
the two or three taps shown. The page watches the bot and picks the chat as soon as it appears,
so nobody has to find a chat ID. You can still enter a chat ID or `@channel` username yourself.
Bots already connected to a webhook can't be looked up; enter the chat ID for those.
Cliq takes a **Webhook Token** from Bots & Tools and a bot or channel **message endpoint**
using your region's Cliq domain. Paste the endpoint without the `?zapikey=...` query string;
enter the token separately. See [Cliq webhook setup](https://www.zoho.com/cliq/help/platform/webhook-tokens.html).

Save the destination, then use **Send test notification** to check it. Tokens stay server-side
in the instance's Firestore data and are never returned by the settings API. Leaving a token
blank keeps it; disabling pauses delivery; **Disconnect** removes it. Alerts contain the app
name, event, report ID, and dashboard link, without reporter text or contact details.
Delivery is best effort, with a five-second timeout and no automatic retries. A provider
failure never rolls back a report or status change; failures appear as `api.notification_failed`
in server logs without credentials. New adapters can supply `Deps.sendNotification`.

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
npm run e2e:notifications # notification settings in Chromium, with delivery stubbed
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

Releasing is automatic: `node scripts/release.mjs <x.y.z>` opens a release PR, and merging it runs
`.github/workflows/release.yml`, which tests, publishes to npm (trusted publishing, no token),
deploys the instance (Google workload identity federation, no key) and tags the Swift package
when `apple/` changed.

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
