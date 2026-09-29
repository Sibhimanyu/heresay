# create-heresay: the setup experience

Who runs it: a developer who has never heard of Heresay's internals, possibly never used
Firebase. They want a working dashboard and a line to paste, and they want to trust what is
happening in their Google account.

## Principles

1. **Say what will happen before it happens.** One screen up front lists everything the command
   will create, and what it costs (nothing, on the free tier).
2. **Ask as little as possible, with good defaults.** Every question has a default; pressing
   Enter all the way through gives a sensible result.
3. **Never leave a mess.** Every step is safe to run twice. State is saved after each step, so a
   crash, a closed laptop or a failed deploy is fixed by running the same command again.
4. **Errors say what to do.** No stack traces. Each known failure has a plain sentence and a fix;
   unknown ones print the command that failed and where the full log is.
5. **Nothing global.** The Firebase tools run through `npx`, pinned to one version. No sudo, no
   global installs.
6. **It proves it worked.** The last step calls the live API and loads the dashboard before
   saying "done".

## The flow

```
$ npx create-heresay

  heresay  ·  every report gets a hearing

  This sets up your own Heresay in your Google account. About 3 minutes.

    • A new Firebase project, owned by you
    • Its database, sign-in and hosting
    • The Heresay dashboard, API and SDK, deployed to it

  Heresay's API runs on Cloud Functions, which needs Firebase's Blaze plan.
  Blaze has a free tier; a small app pays nothing. You can set a budget alert.

◇  Continue?  Yes

◇  Checking your computer
   Node 22 ✓   Firebase tools ✓

◇  Google account
   Signed in as you@gmail.com. Use this account?  Yes          (else: opens firebase login)

◇  Name your Heresay       acme
   Project id              heresay-acme-7k2q                   (checked: available)

◇  Where should data live?  United States (us-central1)        (India · Europe)

◇  Billing account          › Sibhi Orchards
                              Abhishri Academy
                              I need to create one (opens the console, then comes back)

◇  Who can sign in?         you@gmail.com                      (add teammates later)

◆  Building your Heresay
   ✓ Project created                    heresay-acme-7k2q
   ✓ Billing linked                     Sibhi Orchards
   ✓ Services switched on               Firestore, Functions, Auth, Hosting
   ✓ Database created                   us-central1
   ✓ Sign-in set up                     Google and email links
   ✓ Owner added                        you@gmail.com
   ◒ Deploying Heresay 0.1.0            dashboard, API, SDK  (1m 40s)
   ✓ Checked                            API answers, dashboard loads

  Your Heresay is live

    https://heresay-acme-7k2q.web.app

  Next: open it, sign in with you@gmail.com, and add your first app.
  Later:  npx create-heresay update   get new versions
          npx create-heresay status   see what's deployed
```

## Failure cases and what the user sees

| Situation | Message and recovery |
| --- | --- |
| Node older than 20 | "Heresay needs Node 20 or newer. You have 18.2. Install it from nodejs.org, then run this again." |
| Not signed in / declined browser login | Opens `firebase login`; if cancelled: "Setup needs a Google account. Run again when ready." |
| No billing account | Option "I need to create one" opens the billing console and waits; or exit with the link. |
| Billing account closed or no permission | "That billing account can't be used (it's closed, or you can't link it). Pick another." |
| Project id taken | Suggested ids are checked first; if the chosen one is taken, suggest another. |
| Project limit reached | "Your Google account can't create more projects. Delete one at console.cloud.google.com, or ask for more quota." |
| API not ready yet (fresh project) | Retries quietly for up to 2 minutes; the user sees the step still running. |
| Deploy fails | "Deploy failed at: <step>. Your project is fine. Run the same command to try again." Log path shown. |
| Interrupted anywhere | Rerun: "Found an unfinished setup for heresay-acme-7k2q. Pick up where it stopped?" |

## Saved state

`~/.heresay/config.json` holds each instance the user has set up: project id, URL, region,
version, and which steps are done. `heresay update`, `heresay status` and later `heresay connect`
read it, so no command asks for the project id twice.

## Flags, for CI and for testing

`--name`, `--project-id`, `--region`, `--billing <account-id>`, `--owner <email>`, `--yes`
(accept defaults). With `--yes`, the command never prompts. `HERESAY_HOME` moves the saved state
(for tests).

## Other commands

Subcommands of the same package until a separate `heresay` package exists:

- `create-heresay update`  redeploy the bundled release to an instance
- `create-heresay status`  version, URL, and whether setup finished
- `create-heresay open`    open the dashboard
- `create-heresay remove`  unlink billing and delete the project, after typing its id
- `heresay connect` (next milestone) link a repo to an app for agents

## Sign-in

Setup switches on Google sign-in (through `firebase deploy --only auth`, which creates the OAuth
client) and email links (for teammates without a Google account). Membership is by verified
email, so either method reaches the same member.
