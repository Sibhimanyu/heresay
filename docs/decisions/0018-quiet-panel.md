# 0018: A quiet panel

Date: 2026-11-23

## Context

The web panel had three tabs, four cards with a sentence each, a trail switch with chips and a
"See it" list, a line about what is attached, and a Preferences tab with a free-text setup note.
It asked a stranger to make decisions about plumbing before saying what went wrong. Most people
who open it have one sentence to give.

## Decided

- **The panel is one question.** Four short type pills, a text box that asks the matching
  question ("What went wrong?"), Send. Nothing is preselected; Send waits for a type and some text.
- **Reporters no longer see or toggle the trail.** It is always attached, as 0007 intended, and the
  developer is the one who controls it: `data-trail` (off, or the parts to keep) and
  `data-heresay-private`. This supersedes the reporter-visibility part of 0007: the switch, the
  chips, "See it" and the "attached" sentence are gone. Nothing new is captured and nothing is
  sent that was not before.
- **No tabs.** "Your reports" is a quiet button in the header that opens a sub-view with a back
  arrow: statuses, why a report was declined, fix notes and versions, Take back. The reporter
  still reads why a report was declined (0001).
- **Preferences are one row.** "Your name and email" at the bottom of Your reports, two optional
  fields kept on the device; "Signed in as X" when the app called `identify()`;
  `data-preferences="hide"` hides it. The "About your setup" note is dropped.
- **Sent is a moment, not a list.** An animated check (still under reduced motion), where the
  reply will appear, `data-thanks` if set, Done.
- **One footer line on every view:** "Sent to this app's team · Powered by Heresay". Still not
  configurable.

## Three layouts

The same quiet panel comes in three layouts, chosen by the developer (or their coding agent) with
`data-layout` on the web and `HeresayStyle(..., layout:)` in Swift. The reporter never chooses one.
Everything above holds in all three: a type is required, Send waits for a type and text, the
priority comes from the type, Your reports and the footer's "Powered by Heresay" are always there.

- **composer** (default): the panel described above. Most apps.
- **steps**: "What's going on?" with a full-width row per type (line icon, name, chevron), then a
  second screen with the chosen type as a pill, the text box and Send. Most guided; for consumer,
  less-technical and mobile-first audiences. Fewer rows with `data-types`; `open({ type })` jumps
  to the second screen.
- **bar**: a compact floating composer beside the button: a Type chip opening a menu of the four
  types, a one-line text input that grows, a round send arrow, then Your reports, "Powered by
  Heresay" and close. Most compact; for dense or professional tools where a panel would cover the
  work. Not modal. Sent shows a check and Done in the bar; Your reports opens the normal panel.
  Docks full width at the bottom on phones. There is no trail count: the reporter never sees the trail.

All three place themselves like the panel: beside the button, opening away from the edge, never
covering it, for every `data-position` and `data-offset`; with `none`, in the named corner
(bottom-right by default). `data-layout` defaults to composer so existing installs do not change.

## What changed

`public/sdk.js`, its strings (en, fr, ta, hi), the web docs and guides, and the e2e scripts. The
server and the API are untouched; the optional `note` the API still accepts from older SDKs is
simply no longer sent. Placement options (`data-position`, `data-panel`, `data-offset`) are as before.
