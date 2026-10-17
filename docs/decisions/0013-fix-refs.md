# 0013: Fixes carry their proof, and their version

Date: 2026-10-17

## Decided

- **A fix links to the code.** `mark_fixed` (agents), `npx heresay fixed` and the dashboard's
  **Mark fixed** take an optional PR link, commit and version. The team sees them on the report
  ("Fixed in 1.4 · PR #77 · abc1234"). Validated: http(s) links, 7 to 40 hex, plain versions.
- **Reporters see the version, never the PR or commit:** repos may be private, and a commit
  means nothing to someone using the app. `fix_version` is in the reporter's view.
- **"Fixed in 1.4", and "Update to 1.4 to get it" when they're behind.** The web widget and the
  Swift sheet compare the app's own version (`data-version`, `setVersion`, the bundle) with the
  fix's; nothing shows when either is unknown. A version arriving on an already fixed report
  shows the update dot again: what was seen is the status plus the version.
- **The version is often known only at release.** `mark_released(version)` /
  `npx heresay released 1.4` stamps it on every fixed brief from that repo's apps that has none;
  the dashboard's **Set the version it ships in** does one. Merged duplicates get it too.

## Not done

- Watching a repo or app store for releases. The release step calls `mark_released`.
- Reopening when the same problem is reported after the fixed version.
