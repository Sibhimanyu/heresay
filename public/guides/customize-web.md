# Change how Heresay looks in a web app

The defaults are the recommended setup. Change something only when the person asks or the app
clearly needs it. Options are `data-` attributes on the same script tag; no CSS is needed (and
the app's CSS can't reach the widget). The dashboard's **Design** page previews them and gives
the tag; if the person pasted its prompt, do exactly that.

## Options

The first value is the default.

| Attribute | Values |
| --- | --- |
| `data-key` | the app's key (required) |
| `data-layout` | `composer` (type pills and a text box) · `steps` (pick what it is, then say it) · `bar` (a compact box beside the button); see Layout |
| `data-position` | `bottom-right` · `bottom-left` · `top-right` · `top-left` · `bottom-center` · `left-tab` · `right-tab` (a tab on the side edge) · `none` (no button) |
| `data-offset` | `20` · px from the edges, or `x,y` like `24,96` (at most 400) |
| `data-hide-on` | none · comma-separated paths; each hides the button on that path and under it |
| `data-label` | `Report` · any text up to 40 characters |
| `data-accent` | Heresay peacock · a hex colour (`#rgb` or `#rrggbb`). The logo follows it. |
| `data-theme` | `auto` (follows the device) · `light` · `dark` |
| `data-lang` | the page's `<html lang>` · `auto` (the browser's) · `en` · `fr` · `ta` · `hi`. Others show English. |
| `data-intro` | not set (the app calls `introduce()`) · `auto` (a few seconds after the first visit) |
| `data-version` | the app's version, attached to every report |

## Layout

`data-layout` picks how the report form looks and behaves. The type is always required, Send stays
disabled until a type is chosen and something is typed, and the reporter never picks a priority
(the type sets it). Every layout has the same "Your reports" view (clock icon, or the "Your
reports" button in `composer`), the same types (`data-types` leaves some out: fewer pills, rows or
menu items), and the same words in English, French, Tamil and Hindi. It works with
`data-position`, `data-offset`, `data-accent`, `data-theme`, `data-lang`, `data-label` and
`Heresay.open({ type, text })`, which preselects the type and fills the text.

Choose `composer` unless the app clearly fits another, or the person asks. Compactness runs
bar (most compact), composer, steps; guidance runs the other way, steps (most guided), composer, bar.

**`composer`** (default). Best for most apps: web apps, sites, SaaS, anything with no strong reason
to pick another.
- The reporter taps the button. A panel opens beside it with a header (mark, "Report", "Your
  reports" with a dot when something has an update, close), one row of four type pills (Broken,
  Confusing, Could be better, Idea), a text box whose placeholder follows the type ("What went
  wrong?"), Send, and one footer line.
- Tap a pill, type, tap Send. A check and "Sent. You'll see the reply under Your reports." appear,
  with Done.
- On phones (under 600px) the panel is a bottom sheet over a dimmed page. On wider screens it
  opens beside the button, away from the edge, and never covers the button.
- Tag: `<script src="SDK_URL" data-key="KEY" defer></script>` (no attribute needed), or
  `data-layout="composer"`.

**`steps`**: one question at a time. Best for consumer apps, less-technical or mobile-first
audiences, and people who don't know what to write: picking "what is it" first makes the text easier.
- The reporter taps the button. Screen 1 reads "What's going on?" with four full-width rows (warning
  triangle Broken, question circle Confusing, trending-up arrow Could be better, light bulb Idea),
  a clock icon for Your reports (with an unread dot) and close. Tapping a row moves to screen 2:
  a back arrow, the chosen type as a pill, a text box with that type's placeholder, Send and the
  footer. Back returns to the rows and keeps what was typed.
- Two taps and some words. Sent view as in `composer`.
- With `data-types`, only those rows show. `Heresay.open({ type })` jumps straight to screen 2.
- On phones it is a bottom sheet over a dimmed page; the rows are large tap targets.
- Tag: `<script src="SDK_URL" data-key="KEY" data-layout="steps" defer></script>`

**`bar`**: a compact floating composer, not a panel. Best for dense or professional tools (dashboards,
editors, admin screens, data tables) where a panel would cover the work. The page behind stays usable.
- The reporter taps the button. A small bar opens beside it: a "Type" chip, a one-line text input
  "Tell the team…" that grows as they type, and a round send arrow. Tapping the chip opens a small
  menu of the four types with icons (arrow keys, Enter, Escape); the chip then shows the chosen
  type and the placeholder follows it. The arrow is disabled until a type and some text exist
  (Enter sends, Shift+Enter adds a line). A second row has the Your reports clock icon (with its
  dot), "Powered by Heresay" and close.
- After sending, the bar shows a check, "Sent. Replies show under Your reports." and Done. Your
  reports opens the normal Your reports panel, and its back arrow returns to the bar.
- On phones (under 600px) the bar docks to the bottom edge at full width and rides above the keyboard.
- `data-panel` is ignored by the bar, except `beside` (next to the app's own button). There is no backdrop.
- Tag: `<script src="SDK_URL" data-key="KEY" data-layout="bar" defer></script>`

**With `data-position`.** The panel or bar opens beside the button, in its corner, away from the
edge, with room for the button and the same `data-offset`; with `left-tab` or `right-tab` it sits
beside the tab, vertically centred. With `data-position="none"` the app opens it from its own
item (see How it opens): a centred window by default, or next to that item with `data-panel="beside"`; the named corner
is used only for the nudge note. Examples:
`data-layout="steps" data-position="bottom-left"`, `data-layout="bar" data-position="none"`.

## How it opens

| How it is opened | Where the panel appears (web, any layout) |
| --- | --- |
| Floating button (any position or tab) | Beside the button |
| The app's own trigger (`Heresay.open()` called during a click or key press, or any element with `data-heresay-open`), no `data-panel` | **A centred window with the page dimmed (the default and the recommendation).** Bar layout: docked at the bottom centre |
| The app's own trigger with `data-panel="beside"` (opt-in) | A popover next to that trigger, on the side with the most room (right of a left-sidebar item, left of a right-sidebar item, below a header button, above a footer item), aligned to its edge and kept on screen |
| `data-panel="beside"` and a trigger inside a menu that closes when clicked | Next to where the trigger was at the moment of the click |
| Code with no click (an error screen, a timer) | Centred, page dimmed |
| The "Something not working?" note with no floating button | The note sits in the bottom corner; the panel then opens in that corner |
| Page scrolls or resizes while it is open (`beside`) | Stays attached to the trigger, always fully on screen |
| Phones (under 600px) | Bottom sheet (bar: docked bar), whatever the trigger |

`data-panel="sheet"` (full-height side), `data-panel="center"` and `data-panel="corner"` always win over the
trigger. Clicking outside the panel closes it and focus returns to the trigger; the typed text and chosen type
are kept until the report is sent. `Heresay.open({ anchor: element })` (an element or a rectangle
`{ left, top, width, height }`) also centres the window unless `data-panel="beside"` is set.

## Placement

| The app has... | Do this |
| --- | --- |
| Its own feedback or help menu item | `data-position="none"`, plus `data-heresay-open` on that element (preferred, no JavaScript; `data-heresay-open="broken"` starts as that type) or `onclick` calling `window.Heresay?.open()`. The panel opens as a centred window (recommended); ask the person "Open Heresay as a centred window (recommended) or next to your button?" and add `data-panel="beside"` only if they pick next to the button |
| A chat bubble, cookie banner or bottom nav in the bottom right | `data-position="bottom-left"` or `data-offset="20,96"` |
| A mobile bottom tab bar | `data-offset="16,72"` |
| Pages where it's in the way | `data-hide-on="/checkout,/login"` |
| An error screen | a button calling `window.Heresay?.open({ type: 'broken', text: '<what failed>' })` |

## The mark in your own button

`data-heresay-mark` on any element (an empty `<span>` inside the app's own button) fills it with the
Heresay mark, 1em square and hidden from screen readers. It takes the accent (`data-accent`, unless
`data-mark="heresay"`); `data-heresay-mark="currentColor"` takes the text colour. Elements added later
are filled too; elements without the attribute are never touched.

```html
<button data-heresay-open><span data-heresay-mark></span> Report a problem</button>
```

## What to recommend

The design choices worth proposing to the person (own-button mark, wording, where, error screens, brand) are listed with their reasons in guide `install-web`, "What to recommend". Propose, explain in a sentence, accept their answer; never apply a design change unasked.

## Calls

- `Heresay?.identify({ id, label, email })`, `identify()` on sign-out.
- `Heresay?.open({ type, text })`: opens the form, filled in. The person still reviews and sends.
- `Heresay?.introduce({ title, body })`: the one-time bubble; the default words are fine.
- `Heresay?.setScreen(name)`: for screens that change without the URL changing.
- `Heresay?.on('sent', ({ id, type }) => ...)`: after each send; never gets the text. Returns an unsubscribe function.

## The trail

On by default, each report carries what happened in the last few minutes (pages, clicks by
label, failed requests, errors, device) and never what anyone typed. It is collected without
being shown to the reporter, who has nothing to switch. You control it with `data-trail` (`off`, or
the parts to keep) and `data-heresay-private` on elements whose labels are personal data.

## Can't be changed

The Heresay mark on the button, the report types' names, the "Your reports" tab (people must be
able to read why a report was declined), and "Powered by Heresay" in the panel and the
introduction. People should be able to tell the app uses an outside tool. Don't hide these with
CSS, `::part` or scripts.

## Example

```html
<script src="SDK_URL" data-key="KEY"
        data-position="bottom-left" data-accent="#7c3aed" data-label="Feedback"
        defer></script>
```

In Next.js, Nuxt and the rest, add the same attributes to the tag's existing form (for example
`<Script ... data-position="bottom-left" />`). Then run the app and look at the button and the panel.

Older attributes (data-button, data-style, data-size, data-fill, data-shadow, data-mark, data-font, data-panel, data-width, data-backdrop, data-preferences, data-placeholder, data-types, data-thanks, data-trail, data-nudge) still work; leave them as they are in existing apps and don't add them unless asked.
