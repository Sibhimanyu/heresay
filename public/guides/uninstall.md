# Remove Heresay from an app

Goal: the app no longer loads Heresay, and this repo is no longer connected to it. Do the steps
in order: the code first, then disconnect (disconnecting removes the tools you use to read this).

## 1. Find every place it is

Search the repo for the app's key (it starts with `pk_`; `list_apps` shows it) and for
`heresay`, `Heresay` and `sdk/v1.js`. Skip `node_modules` and build output.

## 2. Web apps

- Remove the script tag, wherever it is: a `<script src=".../sdk/v1.js" data-key="pk_...">` in
  an HTML file or layout, a `next/script` `<Script>` in `app/layout.tsx` or `pages/_app.tsx`,
  an entry in `nuxt.config.ts` `app.head.script`, or the equivalent for the framework.
- Remove the calls: `window.Heresay?.identify(...)` and `window.Heresay?.setScreen(...)`.
- If a Content Security Policy allowed the Heresay origin only for Heresay, remove it there too.

## 3. iOS and macOS apps

- Remove the Swift package dependency (`heresay-swift`, product `Heresay`): in Xcode, the
  project's Package Dependencies; or `Package.swift`; or the XcodeGen / Tuist config.
- Remove `import Heresay`, `Heresay.configure(...)`, `.heresayReportButton()`, `.heresay()`,
  `.commands { HeresayCommands() }`, and any `Heresay.identify`, `Heresay.setScreen` or
  `Heresay.present()` calls.

Build the app to be sure nothing still refers to it. Change nothing else.

## 4. Disconnect the repo

    npx heresay disconnect

It removes the `heresay` entry from `.mcp.json` (and `.cursor/mcp.json`), the skill in
`.claude/skills/heresay/`, the Heresay section of `AGENTS.md`, and this repo's token from
`~/.heresay`. Anything else in those files stays. Commit the result.

## 5. The app and its reports

Removing the code does not delete anything in Heresay. The app, its reports and briefs stay
until an owner deletes the app in the dashboard. Once it is deleted, its key stops working: any
copy of the app still out there hides the Report button instead of failing.
