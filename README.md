# Heresay

People using your app can report something from inside it: broken, confusing, could be better,
or an idea. You get each report with the screen, app version and device attached, accept or
decline it (a decline needs a reason), and the reporter sees the outcome in the app.

## Setup

1. Create a project in the dashboard (`/app/`), giving the site it runs on.
2. Paste the line it shows you before `</body>`:
   ```html
   <script src="https://<sdk-host>/sdk.js" data-key="pk_..." defer></script>
   ```
3. Reports show up in the dashboard.

Optional: `data-version="1.4.0"` and `data-accent="#0f766e"` (your own brand colour; defaults to Heresay peacock) on the tag, `Feedback.identify({ id, label })` once you know who
is signed in, `Feedback.setScreen("Checkout")` if your URL does not change per screen.

## How it fits together

One Firebase project, one origin:

| Path | What |
| --- | --- |
| `/sdk.js` | The web SDK. Plain JS, shadow DOM, no dependencies. `public/sdk.js` |
| `/` | The product page. `public/index.html`, `public/site.css` |
| `/docs.html` | Developer docs |
| `/app/` | The developer dashboard. `public/app/index.html`, `public/dashboard.js` |
| `/v1/**` | The `api` Cloud Function. `functions/src/handler.ts` |

Firestore rules deny all client access; everything goes through the function.

## Develop

```sh
npm install && npm --prefix functions install
npm test        # handler logic, in memory
npm run e2e     # the whole loop in a real browser against the emulators
npm run dev     # emulators; site at http://127.0.0.1:5055, dashboard at /app/, demo host app at /demo.html?key=pk_...
```

Emulator ports are non-default (auth 9199, firestore 8181, functions 5101, hosting 5055, UI 4100)
so this can run next to other Firebase projects on the same machine.

## Live

- Dashboard: https://feedback-sdk-live.web.app
- SDK: `https://feedback-sdk-live.web.app/sdk.js`
- Firebase project `feedback-sdk-live` (billing: Sibhi Orchards). `.firebaserc` keeps
  `default` on the `demo-` project so emulators never touch it; deploy with
  `npx firebase deploy --project live`.
- Firestore TTL on `rate.expire_at` deletes old rate-limit buckets. Container images are
  cleaned up after 1 day.

## Brand

Guidelines: `brand/heresay-brand-guidelines.pdf`. Logo files: `brand/svg/`. Source of truth: `scripts/brand_geometry.py`. See `docs/decisions/0003-brand-system.md`.
