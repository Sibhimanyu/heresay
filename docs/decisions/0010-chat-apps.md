# 0010: Ideas from ChatGPT and other chat apps

Date: 2026-10-16

## Decided

- **A lot of ideation happens in chat apps, so Heresay takes requests from them, with the
  conversation's context.** A team member says "send this to Heresay as an idea for Greenroom";
  it arrives in that app's inbox as from them, with what the conversation worked out (why, what
  was ruled out, examples) next to it.
- **Each Heresay is its own MCP server, at `/v1/mcp`.** No bridge site in between, nothing of
  ours holding anyone's tokens, nothing specific to one install: a team adds their own Heresay's
  address to ChatGPT (developer mode connector), Claude, Cursor or any client that takes a
  remote MCP server. Streamable HTTP, stateless, JSON responses; it lives in `core/` (`chat.ts`),
  so it moves with the rest of the API to another backend.
- **Signed in as the member, with OAuth 2.1** (`oauth.ts`): discovery (RFC 9728, RFC 8414),
  dynamic client registration (RFC 7591), public clients with PKCE S256 only, one-time codes for
  ten minutes, access tokens for an hour, refresh tokens rotated on every use. The "Allow?" page
  is the dashboard (`#/authorize`), so it's the team's normal sign-in. Removing someone from the
  team, or disconnecting under **Chat apps**, stops their chat app on its next call.
- **Four tools, nothing more** (three before 2026-10-16): `list_apps`, `draft_request` and `send_draft` (app, type, text, details; see below) and
  `my_requests`. A chat app can't read anyone else's reports, accept, decline, fix or note
  anything. Agent tokens (`agent.ts`) are unchanged and separate.
- **A chat request is a report like any other.** Status open, in the same inbox, sorted by the
  same type order; the assistant picks the type the way a reporter does (never a priority). An
  agent sees it only after a person accepts it: `accept` copies it into a task. `source: 'chat'`,
  `from_member`, `via` (the chat app's registered name) and `details` (up to 8,000 characters)
  mark it; the dashboard shows "From ChatGPT · From the team: …" and the conversation's context.
- **The context is fenced like report text.** An assistant wrote it, from a conversation that may
  have read web pages, so the prompt labels it as a description, never instructions.
- **Limits:** per member, 60 requests an hour and 300 a day. The OAuth endpoints have no sign-in,
  so they're limited per network: register 20, authorize 120, token 240 an hour.

## Chat tokens, for workspaces that block MCP plugins (2026-10-16)

- **Some ChatGPT workspaces don't allow plugins with MCPs** ("403: You do not have permission to
  use plugins with MCPs"); ChatGPT Sites apps are still allowed. So a member can make a **chat
  token** on the Chat apps page (`hct_<id>_<secret>`, shown once, stored hashed, up to 10 each),
  and a Sites app relays ChatGPT's tool calls to `/v1/mcp` with it. Same three tools, as the
  member, the same per-member limits, revoked like any connection, and it ends when the member
  leaves the team. No refresh, no expiry: it's a connection the member manages by hand.
- **The bridge holds only that token.** Not an agent token (which can claim and mark briefs
  fixed), and no allowed-sites entry: it never uses the public report endpoint.

## Draft, then send (2026-10-16)

- **Sending takes two tool calls.** In use, ChatGPT sent straight away and picked an app itself
  (Greenroom) when the person hadn't named one. Telling the model to ask doesn't hold, and
  ChatGPT flags tool text that prescribes when to ask. So the tools do it: `draft_request`
  returns a preview (the app, the type, the text, the other apps) and sends nothing; without an
  app it lists them and asks which. `send_draft` sends it, optionally to another app. Drafts are
  the member's own, last two hours, and send once.
- `send_request`, the old name, now drafts too, so a bridge that still calls it never sends
  unseen.

## Markdown and attached documents (2026-10-16)

- **Chat requests are shown as Markdown on the dashboard:** the text, the conversation's context
  and an attached document. The renderer (`markdown()` in `dashboard.js`) builds DOM nodes and
  sets only text, never HTML: raw HTML in a request shows as text, links are http(s) or mailto
  only and open with `noopener noreferrer nofollow`, headings start at h3. Reports from the
  public stay plain text, so a stranger can't put formatted links in the inbox.
- **`document` on `draft_request`:** a Markdown write-up (a spec, a summary of the whole
  conversation), up to 100,000 characters, with an optional title. Refused when longer rather
  than cut, so its end isn't silently lost. The preview gives its size, not its text. Stored on
  the report and copied to the task; the agent prompt has it inside the fence.

## Long files go in pieces, on one draft (2026-10-27)

- **In use, ChatGPT split specs across requests:** RasanAI got 4-, 7- and 15-part handoffs as
  separate inbox items, each repeating the same rules, each to be accepted on its own.
- **`append_to_draft(draft_id, document, document_title?)`** adds the next piece to a draft's
  document; `send_draft` still sends once, so a whole file is one report, one accept, one task.
  Pieces join exactly as given, in call order, and are trimmed once at send. The whole is capped at
  800,000 UTF-8 bytes (Firestore's 1 MiB per document, with room for the rest of the report);
  a piece that would pass it is refused and the draft is unchanged, never cut. A piece is up to
  100,000 characters, the old `document` limit.
- **A bundle is one request for the rate limit:** only `send_draft` counts toward the 60 an hour
  and 300 a day. Pieces have their own 600 an hour, since each is a write. Each piece keeps the
  draft alive another two hours.
- **Shared rules go once in `details`,** which the agent prompt already fences apart from the
  text and the document. No new field.
- Pieces must be added one call at a time: a draft is rewritten whole on each, so parallel calls
  could lose one. The tool says so, and the answer gives the running size to check.

## The exception to "origin-checked"

CLAUDE.md says public endpoints are rate-limited and origin-checked. The OAuth endpoints and
`/v1/mcp` are rate-limited but not origin-checked: chat apps call them from their servers, which
send no `Origin`, and an `Origin` check is a browser protection anyway. What stands in for it:
`/v1/mcp` needs a member's token; registration only lets a client ask; nothing is granted until
a signed-in member says yes on the dashboard; codes are bound to the client, its registered
redirect and a PKCE verifier.

## Not done

- **Tools that read the inbox or triage from chat.** Possible later, behind a separate scope and
  a separate "Allow?"; triage stays human either way.
- **ChatGPT app directory listing / in-chat UI (Apps SDK components).** The connector works in
  developer mode today; a listed app needs OpenAI's review, and the text results are enough.
