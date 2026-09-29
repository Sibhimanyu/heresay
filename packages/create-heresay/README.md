# create-heresay

Set up your own Heresay: in-app feedback where every report gets a hearing.

```sh
npx create-heresay
```

In about five minutes, in your own Google account, it:

- creates a Firebase project and links a billing account (the API runs on Cloud Functions, which
  needs Firebase's pay-as-you-go plan; a small app stays inside the free tier)
- switches on the database, sign-in (Google and email links) and hosting
- deploys the Heresay dashboard, API and web SDK, and makes you the owner

Then open the dashboard, add an app, and paste the one line it gives you. If setup stops partway,
run it again: it picks up where it stopped.

## Other commands

```sh
npx create-heresay update    # deploy this version to a Heresay you set up
npx create-heresay status    # what's deployed, and where
npx create-heresay open      # open your dashboard
npx create-heresay remove    # delete a Heresay and its Google Cloud project
```

Flags for scripting: `--name`, `--project-id`, `--region us-central1|asia-south1|europe-west1`,
`--billing <account-id>`, `--owner <email>`, `--yes`.

Needs Node 20 or newer. The Firebase tools come bundled; nothing is installed globally.
