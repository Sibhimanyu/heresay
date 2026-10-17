# Heresay design

How Heresay looks and moves, for anyone building UI here. The brand itself (the mark, its
construction, lockups, misuse) is in `brand/heresay-brand-guidelines.pdf` (`.ai` alongside); why
it looks this way is in `docs/decisions/0003-brand-system.md`. This file is the working system:
the values the code ships, and the rules for adding to it.

**Values here are taken from the code**, not the other way round. Where the code and the
guidelines disagree, it is listed at the end, to settle and then fix in one place.

## Principles

- **A guest in someone else's house.** The widget lives inside other people's apps. It is
  neutral, black and white, uses the host's font, and shows peacock only on Send, the selected
  type and the update dot. The host can replace the accent; nothing else about it is themed
  around any one app.
- **Peacock, and a lot of white.** One brand colour family on neutral grounds. Peacock is not a
  status colour, so it never reads as success or error in a host's UI.
- **Rounded, soft and calm, like the mark.** Radius 10 on controls, 14 to 16 on panels and cards.
  Hairline borders before shadows.
- **Plain first, pun second.** Plain words where people act; the court wordplay only where it
  fits exactly, never in an error or a decline.
- **Quiet motion.** Short fades and small lifts that confirm something happened. Everything has a
  `prefers-reduced-motion` path.

## Surfaces

| Surface | Files | Type | Base text | Theme |
|---|---|---|---|---|
| Docs site | `public/docs.html`, `public/site.css` | Bricolage Grotesque, Figtree, JetBrains Mono | 17/1.6 | Light |
| Dashboard | `public/app/`, `public/dashboard.css`, `public/dashboard.js` | Bricolage Grotesque, Figtree, JetBrains Mono | 15/1.55 | Light |
| Web widget | `public/sdk.js` (CSS in `var CSS`, inside a shadow root) | `system-ui`, or the host's with `data-font="inherit"` | 14/1.45 | Follows the device; `data-theme` |
| Apple SDK | `apple/Sources/Heresay/` (`Style.swift`, `Views.swift`) | System; `.rounded` or `.serif` by `HeresayStyle.typeface` | Dynamic Type | Follows the app; `HeresayStyle.theme` |

The fonts are loaded from Google Fonts in `public/app/index.html` and `public/docs.html`: Bricolage
Grotesque 700/800, Figtree 400 to 700, JetBrains Mono 400/500. The widget and the Apple SDK never
load a font: they are guests.

## Colour

### Brand palette

| Name | Hex | Use | Contrast |
|---|---|---|---|
| Deep Peacock | `#0b5e57` | The mark, headlines, selected tab text, dark tiles | 7.6:1 on white |
| Peacock | `#0f766e` | Actions: primary buttons, links, selection, focus rings, the widget accent | 5.5:1 on white |
| Turquoise | `#2dd4bf` | Fill only, never text on white. The mark's eyes, the dark-mode accent | 9.5:1 on Ink |
| Mist | `#e6f4f2` | Tints behind peacock content: inline code, selected chips, notes | |
| Ink | `#15171c` | Text, dark surfaces, the toast | 17.9:1 on white |
| Slate | `#5b6472` | Secondary text, hints | 6.0:1 on white |
| Line | `#e3e6ea` | Hairlines, card borders | |
| Paper | `#f5f6f7` | Light surfaces, table heads | |
| White | `#ffffff` | The ground | |

CSS names: the dashboard uses `--bg --soft --fg --mute --line --acc --deep --mist`; the site uses
`--deep --peacock --turq --mist --ink --slate --line --paper --white`; the widget uses `--fb-*`.
Same values, three vocabularies; use the one already in the file you are in.

**Control borders** are a step darker than Line, so inputs and secondary buttons read as
clickable: `#cfd4da` (dashboard), `#cfd3db` (site).

### Report types (dashboard)

Shown as the type pill's text colour and a 3 px strip on the report's left edge.

| Type | Hex |
|---|---|
| Broken | `#b3261e` |
| Confusing | `#8a5100` |
| Could be better | `#2d5da8` |
| Idea | `#6b4fa8` |

The reporter picks the type; the type sets the priority. These colours mark the type, not
urgency: no badges, no counts in red.

### Statuses

| Status | Dashboard | Widget words |
|---|---|---|
| Open | Paper pill | Waiting for the developer |
| Accepted | Mist pill | Accepted, being worked on |
| Fixed | Peacock pill, white text | Fixed |
| Declined | Slate text | Declined, with the reason under it |
| Withdrawn | Grey tint, Slate text | You took this back |

**A decline is never red.** It is an answer with a reason, not an error.

### Errors

Red is for things that failed, never for a person's decision: `#b42318` in the widget
(`--fb-bad`), `--broken` `#b3261e` in the dashboard (`.gate-msg.bad`, `.btn.danger`).

### Dark

| | Widget (web) | Apple SDK |
|---|---|---|
| Background | `#16181d` | System |
| Text | `#eceef1` | System |
| Secondary | `#9aa1ad` | System secondary |
| Line | `#2c313a` | System |
| Accent | Turquoise `#2dd4bf`, text on it `#0b1f1d` | `#149e91` |
| Mark | Turquoise `#2dd4bf` | Turquoise `#2dd4bf` |
| Error | `#f2b8b5` | |

The dashboard and docs site are light only.

### The host's accent

`data-accent="#hex"` (web) or `accent:` (Apple) replaces peacock everywhere it appears in the
widget. On the web the mark keeps its own colour. On Apple it follows the accent unless
`markFollowsAccent: false`.

## Type

### Families

- **Bricolage Grotesque**, headlines and the wordmark, 700 and 800, tracked in (−0.015em to
  −0.03em). `text-wrap: balance` on dashboard headings.
- **Figtree**, interface and body, 400 to 700.
- **JetBrains Mono**, code, keys, routes, versions, ids, 400 and 500.

### Scale

| Role | Docs site | Dashboard | Guidelines |
|---|---|---|---|
| Display / h1 | clamp(44px, 6vw, 76px) / 1.04 / 800 | 30 / 1.15 / 800 | 56 / 1.05 / 800 / −0.03em |
| Heading / h2 | clamp(32px, 4vw, 46px) / 1.1 / 800; docs pages 32 | 19 / 700 | 32 / 1.2 / 700 |
| h3 | 22 / 1.3 / 700 | | |
| Lede | 20 / 1.55, Slate, 34ch | | |
| Body | 17 / 1.6 | 15 / 1.55 | 17 / 1.6 / 400 |
| Small | 14 | 13 | |
| Code | 14 / 1.7 | 13 | 14 / 1.6 |
| Pill, label | 12 / 700 / 0.02em | 12 / 700 | |

The widget is 14/1.45 with 12 to 13 for hints and 11.5 for the "Powered by" line. Apple uses
Dynamic Type styles (`.headline`, `.subheadline`, `.caption`), never fixed sizes.

## Shape and space

**Radius.** 4 to 5 inline code · 8 tabs and small chips inside cards · **10 controls** (buttons,
inputs, type cards, Send) · 12 snippets, toasts, notes · **14 widget panel and introduction** ·
**16 dashboard cards** · 18 to 24 docs-site feature cards and banners · 999 pills, the round
button.

**Borders.** 1 px Line on cards and panels; 1 px control border on inputs and secondary buttons;
1.5 px on the docs site's widget mock and secondary button.

**Shadows,** only where something floats over the page:

| Element | Shadow |
|---|---|
| Widget button, soft (default) | `0 4px 14px rgba(0,0,0,.18)` |
| Widget button, strong | `0 10px 30px rgba(0,0,0,.35)` |
| Widget introduction and offer | `0 12px 32px rgba(0,0,0,.22)` |
| Widget panel | `0 12px 40px rgba(0,0,0,.3)` |
| Dashboard toast | `0 10px 30px rgb(21 23 28 / .25)` |
| Site panel mock | `0 1px 2px rgba(21,23,28,.06), 0 8px 18px rgba(21,23,28,.08)` |

**Spacing** is meant to sit on a 4-point grid: 4, 8, 12, 16, 20, 24, 32, 48, 96. Gaps between
controls 4 to 12; card padding 22 to 26; page sections 96 apart on the docs site. Optical padding
inside controls (9, 13 px) is allowed where text needs it.

**Layout.** Docs site: 1160 max, 32 gutters, collapses at 900 and 560. Dashboard: collapses at 700
and 960. Widget panel: `data-width`, at most 600 tall, 16 from the edges; full-height sheet on
request.

## Components

**Buttons (dashboard).** `.btn`: white, control border, 10 radius, 8×14, 600. `.btn.primary`:
Peacock, white text, Deep Peacock on hover. `.btn.ghost`: no border, Slate, Ink on hover.
`.btn.danger`: red, only for destroying something. Pressed: `scale(.97)`. Busy: a 14 px ring
spinner before the label. Disabled: 0.45 opacity.

**Buttons (site).** 48 tall (42 small), 22 sides, 10 radius, 700 16px. Primary Peacock to Deep
Peacock on hover; secondary 1.5 px border to Ink on hover.

**Inputs.** Control border, 10 radius, 9×12 (widget 9×10). Focus: 2 px Peacock outline.

**Chips.** 999 radius, control border. Selected: Mist ground, Peacock border, Deep Peacock text.
In the widget's trail, an unselected chip is struck through: it will be left out.

**Cards.** White, 1 px Line, 16 radius, 22×24.

**Pills.** 12/700. Type pills take the type colour. Status pills, see Statuses.

**Toast.** Ink ground, white text, 12 radius, bottom centre, rises 16 px over 0.2 s. Its action
is in `#7dd3c8`.

**Widget.**
- *Button:* a pill (or circle, or edge tab) with the mark and "Report". White with a Line border
  by default, accent fill with `data-fill="accent"`. Heights 40, 48, 58.
- *Panel:* tabs ("Report", "Your reports"), four type cards in a 2-column grid, a text box, Send.
  Selected type: accent border plus 1 px inset.
- *Send:* accent, 10 radius, 600. Busy shows the Glance loader in place of the label.
- *Introduction and offer:* a 300 px bubble with a pointer at the button, fades in over 0.25 s,
  takes no focus, goes after 15 s unless hovered or focused.
- *By-line:* always shown, 11.5 px, "Powered by Heresay" with the mark. Not configurable.

The mark on the button, the type names, the Your reports tab and the by-line are never themed or
hidden (see `HeresayStyle`).

## Motion

| What | How |
|---|---|
| Hover, colour changes | 0.15 s |
| Toast, panels, page fade | 0.2 to 0.25 s ease / ease-out |
| Things arriving | 4 to 6 px rise with fade, 0.25 s ease-out |
| A new report in the feed | Mist highlight fading out over 1.2 s |
| Waiting | A 10 px Peacock dot pulsing, 1.4 s |
| Loading, sending | **Glance**: the mark holds still; its eyes look left, look right, blink. 1.6 s in the widget. `public/loader.svg`, `HeresayGlance` on Apple, all versions in `brand/svg/loaders/` |

With `prefers-reduced-motion: reduce`, every animation and transition stops, except the busy
spinner, which slows to 2 s so busy still reads as busy.

## Accessibility

- Text contrast at least 4.5:1. Turquoise is never text on white.
- Visible focus everywhere: 2 px accent outline, 1 to 2 px offset (−1 on dashboard inputs).
- Tabs, toggles and type cards use `aria-selected`, `aria-pressed` and `aria-checked`, and are
  styled off those states, so the look can't drift from what a screen reader hears.
- The offer note announces itself (web `role="status"`, VoiceOver on Apple) and never takes focus.
- Apple: Dynamic Type throughout; the offer stays while VoiceOver is running.

## Words

- Plain in the widget and the Apple sheet: Waiting, Accepted, Fixed, Declined with a reason.
- Sentence case. No exclamation marks, no urgency ("CRITICAL"), no jokes in errors or declines.
- The reporter never sees a priority. Declines always carry the team's reason.
- Widget strings exist in English, French, Tamil and Hindi (`STR` in `sdk.js`,
  `Words.swift`). A new string needs all four.

## The mark

Use the files, never redraw: `brand/svg/`, `brand/png/`, `brand/ai/`, all generated from
`scripts/brand_geometry.py`. Colour mark on white; on-dark mark on Ink; reversed on Deep
Peacock. Clear space one eye-width; minimum 16 px on screen, small-size artwork below 24 px.
Never stretch, rotate, outline, recolour red, or touch the eyes. Full rules: guidelines pages
4, 5 and 13.

## Where the code and the guidelines disagree

To decide, then fix the losing side:

1. **Dashboard status words.** Guidelines: Heard, Sustained, Overruled, Case closed, in green
   (yes) and amber (a considered no). Code: Open, Accepted, Fixed, Declined, Withdrawn, in Paper,
   Mist, Peacock and Slate, with no green or amber.
2. **Dashboard type sizes.** Guidelines: body 17, heading 32, display 56. Dashboard: 15, 19 and
   30. Probably right for a dense tool; the guidelines don't say so.
3. **Dark accent on Apple.** The web widget uses Turquoise `#2dd4bf`; Apple uses `#149e91`.
4. **Widget dark ground.** Guidelines: "ink panel" (`#15171c`). Code: `#16181d`.
5. **The mark following the accent.** Guidelines: with `data-accent`, "the mark on the button
   stays as drawn". Web does that; Apple's `markFollowsAccent` defaults to `true`.
6. **Two reds.** `#b42318` (widget) and `#b3261e` (dashboard), neither in the palette.
7. **Off-palette colours.** Report-type colours; the toast action `#7dd3c8`; the chat, agent and
   version pills (`#eef2ff`/`#3730a3`, `#fef3c7`/`#92400e`, `#dcfce7`/`#166534`); the site's
   `#8a4b0b`, `#2c4a46`, `#2f343d`, `#b9dcd6`; control borders `#cfd4da` and `#cfd3db`.
8. **Radius.** Guidelines: 10 on controls, 16 on cards. The widget panel is 14; site cards are 18
   to 24.
9. **The 4-point grid.** Many paddings are off it (9, 11, 13, 22, 26 px).

## Changing the design

- A colour, radius or size: change it in every surface's file above, then here.
- A brand change (mark, palette, type): `scripts/brand_geometry.py` and `brand_guidelines.py`,
  regenerate, a note in `docs/decisions/0003-brand-system.md`, then this file.
- New UI: reuse a component above before making one. If it needs a new value, add it here in the
  same change.
- Check with `npm run e2e`: it screenshots the widget and the dashboard to `.context/`.
