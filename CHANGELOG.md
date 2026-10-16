# Changelog

## [0.2.24] - 2026-10-16

### Added

- **Chat tokens, for ChatGPT workspaces that block MCP plugins.** The Chat apps page makes one, shown once. A ChatGPT Sites app can relay ChatGPT's requests to your Heresay with it, so ideas from Chat reach the inbox on every device, as you, with the conversation's context. Revoke it under Connected chat apps.

## [0.2.23] - 2026-10-16

### Added

- **Ideas from ChatGPT, with the conversation's context.** Each Heresay is now an MCP server at `/v1/mcp`. A team member adds it to ChatGPT (Settings › Apps & Connectors › Developer mode › Create; the address is on the new **Chat apps** page), says yes on their dashboard, and can then say "send this to Heresay as an idea for Greenroom". It arrives in that app's inbox as from them ("From ChatGPT · From the team"), with what the conversation worked out, and waits for someone to accept it like any report. `my_requests` says what happened to the ones they sent. Claude, Cursor and other remote MCP clients use the same address.
- OAuth 2.1 for chat apps, signed in as the member: dynamic registration, PKCE, one-time codes, rotating refresh tokens. **Chat apps** in the dashboard lists connections and disconnects them; removing someone from the team ends theirs.

- **Updates come up by themselves in a connected repo.** When a chat starts, the agent hears what's behind and asks the person before applying anything: a newer Heresay (`npx create-heresay update`, by whoever set it up; web apps then get the new Report button with no code change), a newer Swift package than the one pinned in `Package.resolved`, older agent files (`npx heresay connect --update`), and features the app doesn't use yet. A no is kept in `.claude/skills/heresay/decisions.json`; a skipped version is asked about again when a newer one ships.
- Claude Code: `heresay connect` adds a session-start hook to `.claude/settings.json` (`npx -y heresay@latest updates --hook`). It speaks at most once a day per repo, or straight away when something new appears, stays quiet otherwise, and never fails a chat. Other agents are asked to check by `AGENTS.md`, and the MCP server asks for `whats_new` early in every conversation.
- `npx heresay updates` lists the same; `--skip <id>` records a no. `whats-new` still works.

- **"Stuck on something?"** A second note for someone who seems unsure rather than blocked; it opens the form as Confusing. Web `data-nudge` signals `stalled` (typed, then 45 s with nothing more or sent, while still on the page), `circles` (the same few pages over and over in a minute) and `refused` (the same field refused 3 times); Swift `.circles` and `.stalled`. All included in `on` and `.all`. `nudge({ stuck: true })` and `Heresay.nudge(stuck: true)` from the app's code.

- **What happened before a crash goes with the next report (iOS and macOS).** The trail is written to disk as it happens. After the app closes unexpectedly (a crash, a hang or out-of-memory kill, a force quit), the next report carries the last run's final five minutes under "Last run, before the app closed", timed back from when it ended, and a line such as "The app closed unexpectedly 4 s after launch, on the first launch after updating from 1.3 to 1.4". It doesn't wait for MetricKit, and catches what MetricKit doesn't call a crash. The dashboard and the agent prompt show it apart from the current run.
- **The app's own logged errors before a crash** are part of it: Heresay reads the app's log once a minute while the app is in front (every five minutes where a look is slow), and keeps them on the device. Nothing is sent without a report.
- **Web: the trail survives a reload or a new page in the same tab** (kept in that tab's `sessionStorage`), with "The page was reloaded" and, with `data-version`, "First visit since the app updated from 1.3 to 1.4".
- `nudge: .crash` also offers help after an unexpected close MetricKit doesn't report.

### Changed

- The `whats_new` tool also reports versions (`instance@`, `swift@`, `agent-files@`), and works before a teammate has connected (versions only).
- Repos connected before this get the hook the first time an agent offers the `agent-files@6` update and the person says yes.
- `data-nudge="on"` and `nudge: .all` now include the hesitation signals.

### Fixed

- A relative `data-api` (`/v1`) no longer makes the widget's own requests look like the app's.

## [0.2.22] - 2026-10-16

### Added

- **More context with every report.** The device around the app: phone, tablet or desktop and touch or mouse (on Apple, the model), screen and scale, light or dark, language, time zone, connection, how long the page or app has been open, and settings such as reduced motion, more contrast or larger text. Shown on the dashboard under the report, in the agent prompt, and to the reporter under **See it**.
- **A more telling trail on the web:** pages with their titles; clicks with the dialog, form or menu they were in (`button "Save" in dialog "Edit profile"`); forms sent and fields the browser refused, by label and why, never their value; how long a failed request took, and requests that worked but took 3 s or more; alerts the app showed (`The app showed: "Payment failed"`); the page freezing for a second or more; Content Security Policy blocks; and coming back to the tab after being away.
- **On iOS and macOS:** coming back to the app after being away, the device running hot, and on iOS the system's low-memory warning.
- **The agent prompt names the last thing that went wrong** before the trail, so it isn't lost in a long one.

### Changed

- The trail keeps the newest 50 events instead of 30.
- The "connection change" chip is now "device event": it also counts leaving and coming back.

## [0.2.21] - 2026-10-16

### Added

- **Offering help when someone seems stuck.** A small note by the Report button asks "Something not working?" and opens the form as Broken, with the trail. It takes no focus and goes by itself after 15 seconds. Watched on the device and never sent; at most once per tab or launch, and quiet for 7 days after "Not now". Off until the app turns it on.
- Web: `data-nudge="on"`, or some of `clicks` (the same button or link pressed 3 times in 10 s with no change to the page, including a disabled one), `errors` (an uncaught error within 5 s of a click) and `requests` (2 requests failing with 5xx or no answer within 30 s).
- Swift: `Heresay.configure(…, nudge: .all)`, or `.clicks` (macOS: a disabled control clicked 3 times, or one spot clicked 5 times in 2 s) and `.crash` (the app crashed last time, offered once at the next launch).
- `Heresay.nudge()` on both, for an app that saw trouble itself, such as an error screen.

## [0.2.20] - 2026-10-14

### Added

- **What happened before a report, on iOS and macOS.** The Swift package attaches the same trail as the web widget: the screens named with `Heresay.setScreen` or the new `.heresayScreen(_:)`, the app's own `Logger` errors and faults from the last few minutes, going offline and back, and how the last run crashed (MetricKit), sent once. The sheet shows **Attach what happened** with a chip per kind and **See it**, as on the web.
- **macOS: clicks and menu commands.** A click is recorded by the control's accessibility label (`button "Export"`, `toolbar item "Export"`, `checkbox "Sync on Wi-Fi only"`), and every menu command by its path (`menu "File › Export…"`), including when it was chosen with its keyboard shortcut. Never what was typed: fields by their label, secure fields and list rows by their kind only. `.heresayPrivate()` keeps a view's labels out. No swizzling.
- `Heresay.configure(…, trail:)`: `.all` by default, `[]` for none, or some of `.screens`, `.clicks`, `.errors`.


## [0.2.19] - 2026-10-05

### Added

- **What happened before a report.** The web widget attaches the last few minutes in the app: pages visited, what was clicked, requests that failed, errors and console warnings. The dashboard shows it as a timeline under the report, open when something failed, and an accepted report's agent prompt includes it. Never what anyone typed, request bodies, headers or query strings; emails, tokens and long numbers are blanked on the device and again on the server.
- The reporter decides: **Attach what happened** is on by default, a chip per kind removes that part, and **See it** lists every line before sending.
- `data-trail="off"` or a list such as `data-trail="pages errors requests"` on the script tag; `data-heresay-private` on any element keeps its text out of click records.

### Changed

- Apps already using the web widget get the trail when their Heresay is updated, with no code change.

## [0.2.18] - 2026-10-05

### Changed

- Telegram setup explains every tap: choose **Just me**, **A group** or **A channel**, follow the steps shown, and the page finds the chat by itself as soon as the bot hears from it. Pasting the token checks it straight away; entering a chat ID by hand is tucked away for those who already know it.

## [0.2.17] - 2026-10-05

### Changed

- The dashboard loads in one go: one Glance loader from first paint until the page has everything, in one place, without restarting or showing half a page.
- Telegram setup is guided: make a bot, say hello to it, then **Find my chats** lists the chats it can post to so you pick one instead of hunting for a chat ID.

## [0.2.16] - 2026-10-05

### Changed

- Accept, Decline and Mark fixed respond the moment you click: the button shows it is working, the card then says what happened, and a message at the bottom links to the new filter before the card leaves the list.
- Report cards are easier to scan: a colour stripe and tinted label for the report type, and the status shown as a badge.

## [0.2.15] - 2026-10-05

### Added

- Connect Telegram or Zoho Cliq from the dashboard’s Notifications tab, with event selection, test delivery, pause, and disconnect controls.
- Receive alerts for new reports needing review, accepted reports, fixes, and agent handoffs. Tokens stay server-side; alerts contain a dashboard link without reporter text or contact details.
