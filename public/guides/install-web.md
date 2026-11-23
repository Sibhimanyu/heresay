# Add Heresay to a web app

Goal: a Report button on every page, and the first report in the dashboard.

## 1. Find or create the app

`list_apps` shows the apps connected to this repo. If none is this app, `create_app` with a
name, `platform: "web"`, and `sites`: every origin it runs on, for example the production URL
and `http://localhost:3000`. Reports from other sites are refused, so include local dev.

## 2. Add the tag

`install_guide` returns the tag with the app's key (public by design; fine in git). Add it once,
in the shared layout, before `</body>`:

```html
<script src="SDK_URL" data-key="KEY" defer></script>
```

Always `src`, `data-key` and `defer`. Never one tag per page, never in `<head>` without `defer`.

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
| Anything else | the shared layout, or every page's HTML, before `</body>` |

With a Content Security Policy, allow the Heresay origin in `script-src` and `connect-src`.

## 3. Where the button goes

The default is the bottom-right corner. Change it only when the app needs it, by adding
attributes to the same tag (`data-position`, `data-offset`, `data-hide-on`; values in
`customize-web`).

| The app has... | Do this |
| --- | --- |
| Nothing in that corner | Nothing. Keep the default. |
| Its own feedback or help menu item | `data-position="none"`, and that item calls `window.Heresay?.open()` |
| A chat widget, cookie banner or bottom nav in the bottom right | `data-position="bottom-left"`, or `data-offset="20,96"` to sit above it |
| A mobile bottom tab bar | `data-offset="16,72"` (its height plus a margin) |
| Pages where it gets in the way (checkout, login) | `data-hide-on="/checkout,/login"` |
| An error screen | A button there: `window.Heresay?.open({ type: 'broken', text: '<what failed>' })` |

### Layout (optional)

`data-layout` chooses the form: `composer` (the default: type pills and a text box; right for most
apps), `steps` ("What's going on?" rows, then the text; for consumer, less-technical or
mobile-first audiences), or `bar` (a compact box beside the button, with a type menu; for dense
or professional tools where a panel would cover the work, and docked at the bottom on phones). Keep
`composer` unless the app clearly fits another or the person asks. All three work with every
`data-position`, including `none`, and with `data-offset`. Each is described step by step in
`customize-web`. Examples:

```html
<script src="SDK_URL" data-key="KEY" data-layout="steps" defer></script>
<script src="SDK_URL" data-key="KEY" data-layout="bar" data-position="bottom-left" defer></script>
```

## 4. Who is signed in (required if people sign in)

Where the signed-in user becomes known (auth listener, session hook, layout), and on sign-out:

```js
window.Heresay?.identify({ id: user.id, label: user.name, email: user.email });
window.Heresay?.identify();   // after sign-out
```

Nobody is then asked their name, and the team can reply. Leave out fields the app doesn't have.

## 5. Tell people it's there (required)

Add `data-intro="auto"` to the tag: a one-time bubble over the button, a few seconds after the
first visit. If the app has sign-in, onboarding or a tour, leave it off and call
`window.Heresay?.introduce()` once the main screen shows. Later calls do nothing. Don't build
your own dialog. If the app has a "What's new" area, add a line there too.

## 6. Optional

- `data-version="<version>"` (package.json, a build variable).
- `window.Heresay?.setScreen("<name>")` for screens that change without the URL changing.
- `data-accent="#rrggbb"` for a brand colour.

Leave everything else; the defaults are recommended. Change nothing else in the app.

## 7. Prove it

Call `check_install`. `found_in_code` means the key is in this repo; `seen_running` means the
SDK loaded in a browser. Run the app, tap **Report**, send a test; `reports` goes up. No button:
the tag isn't on that page, or a CSP blocked it (see the console). "This site is not allowed":
add that origin to the app's sites. The install is done when `todo` is empty.
