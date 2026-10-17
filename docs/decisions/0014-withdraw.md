# 0014: Taking a report back

Date: 2026-10-17

## Decided

- **Whoever sent a report can take it back while it's open**: the reporter in the app ("Take
  back" in Your reports, web and Swift), a team member from a chat app (`withdraw_request`), an
  agent for its own finding (`withdraw_finding`, `npx heresay withdraw`).
- **Never deleted.** It becomes **withdrawn**, a status of its own, with who (the person who sent
  it, the member's email, or the agent's repo), when, and their reason if they gave one. The
  dashboard lists it under **Withdrawn**, with nothing to triage. The reporter sees "You took this
  back" and their reason; it doesn't count as an update.
- **Only while open.** Once accepted, work may have started, so it can't be taken back; the
  reporter is told to tell the team instead.
- **Ownership is proven the same way as reading one's reports:** the device id that sent it (or
  the member's chat device, or the repo's). Someone else's report answers "no such report",
  so a device can't probe. The SDK call is origin-checked and rate-limited like the others.
- **Reports merged into a withdrawn one stand on their own again**, still open, because their
  reporters still want an answer.
