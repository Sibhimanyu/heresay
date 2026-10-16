# 0009: Updates come up in chat

Date: 2026-10-16

## Decided

- **The agent in a connected repo brings Heresay updates up by itself, and asks.** People don't
  read changelogs or run update commands for a tool they set up once. The agent is already in
  the repo, so it says "Heresay has a newer Swift package; want me to update it?" and applies
  nothing without a yes. A no is kept in `.claude/skills/heresay/decisions.json`, committed.
- **Four kinds, one list** (`whats_new`, `npx heresay updates`):
  - `instance@x.y.z`: the Heresay is behind npm's `create-heresay`. Its owner runs
    `npx create-heresay update` (their Google account). Web apps load the SDK from the Heresay,
    so this is also how the web Report button updates, with no code change.
  - `swift@x.y.z`: a `Package.resolved` pins `heresay-swift` below its newest git tag
    (`git ls-remote`, no API limits). Apple apps update only by moving the pin.
  - `agent-files@N`: the skill, `.mcp.json` or the hook here are older than this `heresay`.
  - features from the Heresay's `changes.json` the app doesn't use (0007's mechanism).
  A skipped version comes back when a newer one ships; a skipped feature doesn't.
- **When a chat starts, not only in Heresay tasks.** Claude Code: a `SessionStart` hook in
  `.claude/settings.json`, written by `heresay connect`, runs `npx -y heresay@latest updates
  --hook` and adds what it found to the agent's context. Other agents: `AGENTS.md` asks for one
  check early in each conversation; the MCP server's instructions say the same.
- **Rarely and harmlessly.** The hook checks at most once an hour and speaks at most once a day
  per repo on a computer, sooner only when a new update appears. It prints nothing when there's
  nothing, never exits with an error, and gives up after 12 s.
- **Old repos bootstrap through the MCP server.** `.mcp.json` runs `heresay@latest`, so its new
  instructions and `whats_new` reach every connected repo; the first update it offers there is
  `agent-files@6`, which adds the hook.

## Not done

- **Applying anything without asking**, even a patch version. An update changes what the app's
  users see, and the person may not own the Heresay.
- **Telling the Heresay's owner from the server** (an email or dashboard banner when it's behind).
  Worth doing; separate from the repo side.
