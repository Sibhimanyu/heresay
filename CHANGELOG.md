# Changelog

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
