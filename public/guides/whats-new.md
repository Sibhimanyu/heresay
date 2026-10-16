# What's new in Heresay

Heresay keeps changing after an app has it: new versions of the Heresay itself and the Swift
package, and new features. In a connected repo, bring these up with the person and **ask before
applying any**.

## When to check

- **When a chat starts.** In Claude Code, a session-start check (`.claude/settings.json`, added
  by `heresay connect`) does it and tells you what it found. Other agents: call `whats_new`
  (or run `npx -y heresay@latest updates`) once early in the conversation, whatever it is about.
- **At the start of every Heresay task**, call `whats_new` yourself.

## What to do with it

1. If it returns nothing, carry on. Don't mention it.
2. If it returns updates, tell the person in one short sentence each, in their words, not ours,
   for example: "Heresay has a newer Swift package (0.2.22) with more context in reports. Want me
   to update it?" One question for all of them is fine. If they asked about something else,
   help with that first and ask at the end of your reply.
3. **Never apply an update without a yes.** It changes what the app's users see.
   - Yes: follow its `how` (below), then `check_install` for that app.
   - No: call `skip_update` with its id (or `npx heresay updates --skip <id>`), so nobody asks
     again. It is recorded in `.claude/skills/heresay/decisions.json`; commit that. A skipped
     version is asked about again when a newer one comes out.
   - Not now: leave it; it comes up again in a later chat.

## The kinds of update

- **`instance@x.y.z`: this team's Heresay is behind.** The dashboard, the API and the web Report
  button (web apps load it from the Heresay, so they get it with no code change). Whoever set the
  Heresay up runs `npx create-heresay update`; it signs in to Google with their account. Offer to
  run it only if that's the person you're talking to.
- **`swift@x.y.z`: the Swift package is behind.** Xcode: File › Packages › Update to Latest
  Package Versions. A Swift package: `swift package update heresay-swift`. From a terminal for an
  Xcode project: delete the `heresay-swift` pin from its `Package.resolved` and run
  `xcodebuild -resolvePackageDependencies`. Build, read the CHANGELOG for anything that needs a
  code change, and commit `Package.resolved`.
- **`agent-files@N`: this repo's Heresay agent files are old.** Run
  `npx -y heresay@latest connect --update` and commit what it lists, in its own commit.
- **Anything else is a feature this app doesn't use yet**, from this Heresay's feature list. Its
  `how` names the guide to follow.

If the tool isn't there (an older `heresay` package), read `/guides/changes.json` on this Heresay
and check the code for each entry's `detect` strings yourself.
