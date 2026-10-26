# 0015: The Heresay logo on the team's Telegram bot

Date: 2026-10-26

## Decided

- **A team's own Telegram bot gets the Heresay logo as its profile picture, when it has none.**
  Alerts then show a recognisable icon in the chat. The set happens once, when a bot token is
  newly connected, and only if the bot has no picture: we never overwrite one a team chose.
- **Never fatal.** If Telegram is old, slow or rejects the image, the save still succeeds. The
  failure is logged without the token.
- **Owners can set it on purpose.** Notifications has a button, `POST /v1/notifications/telegram/photo`
  (owner-only, rate-limited, saved token, which never comes back), that replaces the current picture.
- **"Has a picture" is `getUserProfilePhotos` on the bot's own id** (from `getMe`). If Telegram
  won't answer that, we skip rather than overwrite a picture we couldn't see.
- **The image is embedded in `core/`** (`bot-logo.ts`, a 512x512 JPEG of the mark on white, since
  Telegram takes static profile photos as JPG). `scripts/bot-logo.mjs` regenerates it. Nothing
  fetched at runtime, no new dependency; the call is plain `fetch` like the rest of the transport.
