# Heresay Lite: Spark plan, no Cloud Functions

The same Heresay, with the API as a Node server you run anywhere. Firestore and Firebase Auth
stay on Firebase's free Spark plan; nothing needs a billing account.

| Piece | Where it runs | Used for |
| --- | --- | --- |
| `node-server.ts` (`Dockerfile.lite`) | any Node host | the API, dashboard, SDK |
| Firestore (Spark) | Firebase | reports, apps, tasks, team, tokens, settings |
| Firebase Auth (Spark) | Firebase | dashboard sign-in by email link |

## Set up with the CLI

```sh
npx create-heresay --lite --origin https://your-host.example
```

It creates the Firebase project (no billing account), turns on Firestore and email-link sign-in,
allows your host's domain, publishes the database rules, adds you as owner, creates the server's
key, and writes a folder (`~/.heresay/instances/<id>/`) with a `Dockerfile` and a `lite.env`.
Build that folder on your host and add each line of `lite.env` as an environment variable.
`npx create-heresay update` prepares a new folder; rebuild the host from it.

## Set up by hand

1. Create a Firebase project (stay on Spark). Turn on Firestore and Auth (Email link sign-in).
2. `firebase deploy --only firestore` to publish `firestore.rules` and `firestore.indexes.json`.
3. Add a web app in the project settings; copy its config object.
4. Create a service-account key (Project settings, Service accounts).
5. Run the image on your host with:

| Variable | Value |
| --- | --- |
| `HERESAY_ORIGIN` | the public https address of the host, no trailing slash |
| `HERESAY_FIREBASE_CONFIG` | the web app config, as JSON |
| `GCLOUD_PROJECT` | the Firebase project ID |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | the service-account key as one line of JSON (or set `GOOGLE_APPLICATION_CREDENTIALS` to a file path) |
| `HERESAY_TRUST_PROXY` | `1` behind a proxy (set in the image) |
| `HERESAY_RATE_STORE` | `firestore` to share rate limits across instances (default: in memory) |

6. In Firebase Auth, add the host's domain to Authorized domains.
7. Write the first owner into `meta/instance` (what `create-heresay` does at the end of setup).

## Spark budget

Spark allows roughly 50k Firestore reads and 20k writes a day (check the current limits). An app
page view costs about 3 reads once; a device with no reports asks the server at most once a day.
A report costs a handful of reads and writes. Running out stops the API until the quota resets.
