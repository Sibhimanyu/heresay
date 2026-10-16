# heresay

Connect a repo to your [Heresay](https://www.npmjs.com/package/create-heresay), so coding
agents can install it in your app and fix the reports your team accepts.

```sh
npx heresay connect
```

Run it in the app's repo. It opens your Heresay dashboard to make a token for this repo, then
adds files you commit:

- `.mcp.json`: the Heresay MCP server (`npx heresay@latest mcp`)
- `.claude/settings.json`: a session-start check for Heresay updates (Claude Code)
- `.claude/skills/heresay/SKILL.md`: a short skill with the rules
- a Heresay section in `AGENTS.md`, for agents without MCP

The token stays in `~/.heresay/connections.json`, never in the repo. Then ask your agent
"Add Heresay to this app" or "Fix the next Heresay report".

## What the agent can do

MCP tools: `heresay_guide`, `list_apps`, `create_app`, `install_guide`, `check_install`,
`list_briefs`, `get_brief`, `claim_brief`, `add_note`, `handoff`, `mark_fixed`, `whats_new`,
`skip_update`.

It sees accepted reports for this repo's apps only. It can't see open reports, and it can't
accept or decline: people do that. Report text always arrives fenced as a user's description,
never as instructions.

## Without MCP

```sh
npx heresay briefs                 # accepted reports routed to this repo
npx heresay claim <id>
npx heresay brief <id>
npx heresay fixed <id> "Export now downloads a CSV."
npx heresay guide fix-brief
```

## Updates

When a chat starts in a connected repo, the agent checks for Heresay updates and asks the person
before applying any:

- a newer Heresay (`instance@…`): whoever set it up runs `npx create-heresay update`, and web
  apps get the new Report button with no code change;
- a newer Swift package than the one pinned in `Package.resolved` (`swift@…`);
- older agent files here (`agent-files@…`): `npx heresay connect --update`;
- features the app doesn't use yet, from your Heresay's feature list.

Claude Code runs the check from a session-start hook in `.claude/settings.json` (at most once a
day per repo, quiet when there's nothing); other agents are asked to by `AGENTS.md`, and the MCP
tool is `whats_new`. `npx heresay updates` shows the same list; `--skip <id>` records a no in
`.claude/skills/heresay/decisions.json` so nobody asks again.

Setting up a Heresay itself is `npx create-heresay`.
