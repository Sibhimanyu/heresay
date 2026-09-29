# Add Heresay to a web app

Goal: a Report button appears on every page, and the first report reaches the dashboard.

## 1. Find or create the app

`list_apps` shows the apps connected to this repo. If none is this app, `create_app` with a
name, `platform: "web"`, and `sites`: every origin it runs on, for example the production URL
and `http://localhost:3000`. Reports from other sites are refused, so include local dev.

## 2. Add the script tag, once, on every page

`install_guide` returns the exact tag with the app's key. The key is public by design; it is
fine in source control. Put the tag as late as possible, loaded once:

| Framework | Where |
| --- | --- |
| Next.js (app router) | `app/layout.tsx`: `import Script from 'next/script'`, then inside `<body>` after `{children}`: `<Script src="SDK_URL" data-key="KEY" strategy="afterInteractive" />` |
| Next.js (pages router) | `pages/_app.tsx`, same `<Script>` |
| Nuxt | `nuxt.config.ts`: `app: { head: { script: [{ src: 'SDK_URL', 'data-key': 'KEY', defer: true }] } }` |
| SvelteKit | `src/app.html`, before `</body>` |
| Vite (React, Vue, Svelte) | `index.html`, before `</body>` |
| Create React App | `public/index.html`, before `</body>` |
| Angular | `src/index.html`, before `</body>` |
| Astro | the shared layout component, before `</body>` |
| Anything else | every page's HTML, or the shared layout, before `</body>` |

If a Content Security Policy is set, allow the Heresay origin in `script-src` and `connect-src`.

## 3. Optional, when the app has them

- Signed-in users: after sign-in call `window.Heresay?.identify({ id: user.id, label: user.name })`,
  and `window.Heresay?.identify()` after sign-out.
- A version: add `data-version="<version>"` to the tag (from package.json, a build env var, ...).
- Screens that change without the URL changing: `window.Heresay?.setScreen("<name>")` on each change.
- A brand colour: `data-accent="#rrggbb"` (hex only).

Change nothing else in the app.

## 4. Prove it

Run the app, open it in a browser, tap **Report** in the bottom corner and send a test. Then
`check_install` should show `reports: 1` and the screen you sent it from. If the button doesn't
appear: the tag isn't on that page, or a CSP blocked it (check the browser console). If sending
fails with "this site is not allowed": that origin isn't in the app's sites.

Heresay detects the framework from the first report, so the dashboard shows it without anyone
choosing.
