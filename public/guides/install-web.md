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

## 3. Who is signed in (required if people sign in)

If the app has sign-in, tell Heresay who it is wherever the signed-in user becomes known (the
auth provider's listener, the session hook, the layout that reads the user), and clear it on
sign-out:

```js
window.Heresay?.identify({ id: user.id, label: user.name, email: user.email });
window.Heresay?.identify();   // after sign-out
```

Then the person is never asked their name to send a report, and the team can reply to them. It
follows whoever is signed in on that device, so apps with many users and many logins need
nothing else. Use the fields the app already has; leave out any it doesn't.

## 4. Tell people it's there (required)

People who have never seen the Report button won't go looking for it. Heresay has a one-time
introduction: a small bubble over the button saying what it's for, shown once per device.

- Most apps: add `data-intro="auto"` to the tag. It appears a few seconds after the first page
  load.
- Apps with sign-in, onboarding or a first-run tour: leave the attribute off and call
  `window.Heresay?.introduce()` once the person reaches the main screen, so it never covers a
  login form or competes with the tour. Calling it again later does nothing.
- If the app already has a "What's new" or announcements area, add a line there too, e.g.
  "New: tell us what's broken or could be better with the Report button."

Don't build a custom dialog for this; `introduce()` is the one.

## 5. Optional, when the app has them

- A version: add `data-version="<version>"` to the tag (from package.json, a build env var, ...).
- Screens that change without the URL changing: `window.Heresay?.setScreen("<name>")` on each change.
- A brand colour: `data-accent="#rrggbb"` (hex only).

Change nothing else in the app.

## 6. Prove it

Call `check_install`. It finds the key in this repo's code by itself (`found_in_code`). Then run
the app and open it in a browser: `seen_running` shows the SDK loaded there. To test the whole
path, tap **Report** in the bottom corner and send a test; `reports` goes up. If the button doesn't
appear: the tag isn't on that page, or a CSP blocked it (check the browser console). If sending
fails with "this site is not allowed": that origin isn't in the app's sites.

Heresay detects the framework from the first report, so the dashboard shows it without anyone
choosing.
