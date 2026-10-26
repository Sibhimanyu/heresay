# 0016: Accept and decline from Telegram

Date: 2026-10-26

## Decided

- **A team member can accept or decline a new report from the Telegram alert.** The "new report"
  message gets three buttons: Accept, Decline, Show full text. The message stays plain text (no
  `parse_mode`), so nothing a reporter wrote is ever interpreted as formatting. Other events, and
  Cliq, are unchanged.
- **Same code path as the dashboard.** Accept and decline call `triage` in `handler.ts` with the
  member as the actor. A report still reaches an agent only through a person's `accept`, declining
  still needs a reason (checked server-side), and priority is never touched. All of it lives in
  `core/telegram.ts`; the Firebase adapter only wires `telegramApi`, like `telegramPhoto`.
- **Decline asks why.** Tapping Decline answers the tap and sends a force-reply "Reply with why
  you're declining this (the reporter will read it)". Only that person's reply, within ten minutes,
  counts; an empty or over-long reply is refused and the prompt stays. The message is then edited to
  "Declined by <email>: <reason>" and the buttons go.
- **Show full text** replies to the alert with the type, the app and the report's text, plain text,
  cut at Telegram's 4,096. The alert itself still carries no reporter text; this is on request, for a
  linked member, in the team's own chat.
- **Tapped twice, or decided in the dashboard first:** the tap says "Already accepted by X" and
  changes nothing (the store's atomic status check does that, as in the dashboard).

## Why linking

A Telegram tap says who tapped by Telegram user id, and that isn't a Heresay sign-in. Anyone in the
chat could press the buttons, and a group can have people who aren't on the team. So a tap counts
only if that Telegram user was linked to a team member, and **membership is re-checked at every
tap**: removing someone from the team ends their Telegram access at once. An unlinked tap gets an
alert pointing at the dashboard and does nothing.

- **Any signed-in member can link** (not owner-only): Notifications > Act from Telegram >
  "Link my Telegram" (`POST /v1/telegram/link-code`) shows a one-time code. The member sends
  `/start CODE` (or `/link CODE`) to the bot, in a private chat or in the configured group. The bot
  replies "Linked as <email>". `DELETE /v1/telegram/link` unlinks; `GET` says whether you are.
- **Codes:** 8 characters from an alphabet without look-alikes, valid once, for ten minutes, stored
  as a hash (never the code). A new code replaces the member's earlier one. Guessing is limited to
  ten tries an hour per Telegram user, on top of the per-chat limit.
- **No new Store methods.** Codes (`link`) and pending declines (`decline`, keyed by chat and prompt
  message) are `AuthRecord`s, whose `takeAuth` is already atomic, so a code works once even when
  two tries land together; `store-contract.ts` covers the two new kinds on both stores. The links
  themselves (Telegram user id -> email) live on the instance, in `notifications.telegram.links`
  next to the webhook secret; neither is ever returned to the browser.

## The webhook, and the exception to "origin-checked"

`POST /v1/telegram/webhook/<secret>` is public, rate-limited (per network, and per chat) and **not
origin-checked**, like the OAuth and MCP endpoints in 0010: Telegram calls it from its servers and
sends no `Origin`, and an `Origin` check is a browser protection anyway. What stands in for it:

- **Two secrets, both required, compared in constant time:** the one in the path, and Telegram's
  `X-Telegram-Bot-Api-Secret-Token` header, which is derived from it (so a secret leaked from an
  access log isn't enough). A wrong or missing one is a bare 404.
- A valid call always gets 200, quickly, whatever happened inside; errors are swallowed (and logged
  without the token), because Telegram retries anything else.
- Only callbacks from the configured chat are looked at. Everything else is ignored.
- The secret is made once per Heresay and stored on the instance.
- **Registration.** When a bot token is saved or changed and this Heresay's public address is
  https, we call `setWebhook` (url, `secret_token`, `allowed_updates` message and callback_query);
  `deleteWebhook` when Telegram is turned off, the token is cleared, or the bot is replaced. On
  http (the emulator) it is skipped silently. A failure never fails the save.
- **Looking up chats.** `getUpdates` is refused once a webhook is set, so for the saved bot the chat
  lookup says "Telegram is connected; to pick a different chat, enter its chat ID." A newly pasted
  token still uses the old lookup.

## Not done

- **Fixed, notes, merge from Telegram.** Accept and decline only; the rest stays in the dashboard.
- **Other events' buttons.** Only "new report" has them.
- **Choosing a repo or adding a note on accept.** Accepts from Telegram use the default repo and no
  note, as a bare dashboard accept does.
- **Declining in a channel.** Nobody can reply to a bot's post in a channel, so the reason can't be
  given there; accept works once linked (in a private chat). Use a group or a private chat.
- **Groups need the bot to see replies.** With privacy mode on, a bot still gets replies to its own
  messages and commands sent to it, which is all this uses.
- **Reporter text can contain @mentions or links**, which Telegram may highlight in plain text. It
  only appears after a linked member asks for it, in the team's own chat.
- **Not tried against a real bot.** The tests use a fake transport; the first real connection is the
  check of Telegram's side.
