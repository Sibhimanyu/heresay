# 0005: One Heresay per team, in the team's own Google account

Date: 2026-09-29

## Decided

- **No shared hosted instance.** Every team, us included, runs `npx create-heresay`, which
  creates a Firebase project in their account and deploys the bundled release to it. Reports
  never sit on our servers.
- **An instance is one team.** `meta/instance` holds the members (owner or member) by email.
  Every member sees every app. Owners add and remove people; the last owner can't be removed.
  `create-heresay` writes the first owner, with the user's own Google credentials (IAM bypasses
  the deny-all rules).
- **Membership is by verified email only.** An unverified address never matches, so anyone can
  create an account on the project's Auth and still see nothing. No instance yet: 503
  `no_instance`; signed in but not on the team: 403 `not_member`. The dashboard explains both.
- **Sign-in is Google plus email links.** Google is switched on through Firebase's provisioning
  API, which also creates the OAuth client (the old blocker: that can't be done by hand over
  REST). Email links cover teammates without a Google account. If Google fails, setup warns and
  carries on with email links.
- **Apps have a platform** (`web`, `ios`, `macos`, `android`, `react-native`, `flutter`) and a
  framework. Only web has an SDK today; the others are shown as coming soon in the wizard.
- **The instance's own origin is always allowed** to send reports, so the dashboard's test page
  works whatever the app's allow-list says. No other site can claim that origin.

## Why the CLI calls Google's REST APIs itself

The Firebase CLI's calls are billed to its own OAuth project, whose quota every Firebase CLI user
shares; on a first run we hit `429 Provision requests per minute` there. `create-heresay` reuses
the Firebase CLI login but sends its own calls with `x-goog-user-project: <the new project>`.
It only shells out to the Firebase CLI for `login` and `deploy`.
