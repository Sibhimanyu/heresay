# What's new in Heresay

Heresay gains features after an app is installed. When you work on anything Heresay in a
connected repo, check whether this app is missing any, and **ask the person before adding them**.

## Every Heresay task starts with this

1. Call `whats_new` (or run `npx heresay whats-new`). It compares this Heresay's feature list with
   this repo's code and returns only the features this app doesn't have and nobody skipped.
2. If it returns nothing, carry on with the task. Don't mention it.
3. If it returns updates, tell the person in one short sentence each, in their words, not ours,
   for example: "Heresay can now show people a one-time note that the Report button exists
   (on the Mac it's otherwise hidden under Help). Want me to add it?" Then ask. One question for
   all of them is fine.
4. **Never add a feature without a yes.** A new feature changes what the app's users see.
   - Yes: follow the `how` guide for it, then `check_install` for that app.
   - No: call `skip_update` with its id (or `npx heresay whats-new --skip <id>`), so
     nobody asks again. It is recorded in `.claude/skills/heresay/decisions.json`; commit that.
   - Not now: leave it; it will come up next time.
5. Then do the task you were asked to do.

If the tool isn't there (an older `heresay` package), read `/guides/changes.json` on this Heresay
and check the code for each entry's `detect` strings yourself.
