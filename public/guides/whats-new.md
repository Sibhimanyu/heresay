# What's new in Heresay

Heresay keeps changing after an app has it: new versions of the Heresay itself and the Swift
package, and new features. In a connected repo, bring these up with the person, explain them, and
**ask before applying any**. A version update is never just a bump: what the app's users see may
change, and the person should hear that first.

## 1. Notice

- **When a chat starts.** In Claude Code a session-start check (`.claude/settings.json`, added by
  `heresay connect`) tells you what it found. Other agents: call `whats_new` (or run
  `npx -y heresay@latest updates`) once early in the conversation, whatever it is about.
- **At the start of every Heresay task**, and when asked to "update Heresay": call `whats_new`.
- If it returns nothing, carry on and don't mention it. If the person asked about something else,
  help with that first and raise the updates at the end of your reply.

## 2. Explain each item, in plain words

For every update, say three things, in the person's words, not ours:

- **What the app's users will see.** For a version update read `notes`: each release lists
  `users` (what the people using the app see), `developers` (what changes for whoever builds it)
  and `action` (a code change needed, if any). If `users` has anything, say so first: "the Report
  panel your users see was redesigned: no tabs, compact type pills..."
- **What code changes.** Often none (web apps get Report button changes from the Heresay with no
  code change); for a feature, the lines or attributes it adds.
- **Your recommendation for this app, with a reason.** Look at the app. An app with its own
  "Report a problem" menu item or sidebar row should use `open-next-to-trigger`: the panel opens
  beside that item instead of in a corner. A dense editor may suit the `bar` layout; most apps
  should keep the default. Say "I'd add it because..." or "I'd skip it because...". Don't just
  read out the list.

Fields you get: `id`, `title`, `summary`, `how` (the guide to follow), `notes` and `then` on version
updates, `offer` on features (`recommended`, or `optional`: only offered right after the version
that introduced it).

## 3. Ask, per item

**Add it / Not now / Never.** One question covering several items is fine if each is clear.
**Never apply an update without a yes**: it changes what the app's users see.

## 4. Apply

Follow the item's `how` (a guide), run `check_install` for the app, and **commit each item
separately** so any one can be reverted. For a version update, read `notes[].action` and do what
it says.

## 5. Show the result

Say where to see it: the screen and what to click or tap ("open Settings, press Report a problem:
the panel opens next to it"). If you can run the app, take a screenshot and show it.

## 6. Chain

After a version update, look at its `then`: the features that version introduced that fit this
app. Explain and offer each the same way (steps 2 to 5). Don't offer them before the update is
applied, or when the person said Not now to the update.

## 7. Remember

- **Never**: call `skip_update` with the id (or `npx heresay updates --skip <id>`). It is recorded
  in `.claude/skills/heresay/decisions.json`; commit that. A newer version of a skipped version
  update is asked about once more.
- **Not now**: leave it. It comes up again in a later chat.
- **Yes**: nothing to record; once applied it stops being offered.

## The kinds of update

- **`instance@x.y.z`: this team's Heresay is behind.** The dashboard, the API and the web Report
  button (web apps load it from the Heresay, so they get it with no code change, but their users
  see the new button). Whoever set the Heresay up runs `npx create-heresay update`; it signs in to
  Google with their account. Offer to run it only if that's the person you're talking to.
- **`swift@x.y.z`: the Swift package is behind.** Xcode: File › Packages › Update to Latest
  Package Versions. A Swift package: `swift package update heresay-swift`. From a terminal for an
  Xcode project: delete the `heresay-swift` pin from its `Package.resolved` and run
  `xcodebuild -resolvePackageDependencies`. Build, do what the notes' `action` says, commit
  `Package.resolved`. The package also ships `CHANGELOG.md`.
- **`agent-files@N`: this repo's Heresay agent files are old.** Run
  `npx -y heresay@latest connect --update` and commit what it lists, in its own commit.
- **Anything else is a feature this app doesn't use yet.** Its `how` names the guide to follow.

If the tool isn't there (an older `heresay` package), read `/guides/releases.json` and
`/guides/changes.json` on this Heresay and check the code for each entry's `when` and `detect`
strings yourself.
