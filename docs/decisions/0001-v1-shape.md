# 0001: v1 shape

Date: 2026-09-27

## Decided

- **Backend: a new Firebase project** (Firestore, one HTTP function, Hosting). It matches what
  the user already runs, and the SDK, API and dashboard share one origin, so the setup line is
  just a script tag. Separate from Flotilla's `multiplayer-agents-eec02`.
- **Attached to each report:** route or screen, app version, platform, OS, browser, optional
  user id and label. No screenshot in v1.
- **Where reports go:** this project's dashboard. Accepted reports get a "copy prompt for agent"
  button. GitHub issues and Flotilla come later, and both will read from `tasks`, not `reports`.
- **Accept/decline guarantee by construction.** `accept` copies the report into a separate
  `tasks` collection in the same transaction. The prompt endpoint reads only `tasks`. An open
  report cannot reach an agent because it is not in the collection agents are fed from.
- **Abuse controls instead of App Check for now:** an origin allow-list per project (a browser
  cannot forge Origin, so another site cannot use your key) plus fixed-window rate limits per
  device (5/10 min, 20/day), per IP (30/hour) and per key (500/day). App Check needs the host to
  run the Firebase client SDK and a reCAPTCHA key, which breaks the one-line setup; add it as
  an opt-in when a host is actually abused, or for iOS where DeviceCheck is cheap.
- **"Your reports" is a POST.** Browsers omit Origin on same-origin GETs, which failed the
  allow-list, and it keeps the device id out of URLs and logs.

## Open

- Name.
- iOS SDK, after the web loop is live in a real app.
