# 0006: What a developer can change about the widget, on the web and on iOS and macOS

Date: 2026-09-30

Chosen option by option in `docs/customization-decisions.html` (the same list, with a preview).

## Decided

- **Every option is a `data-` attribute on the one script tag,** with a value from a fixed list
  (or plain text cut to a length, or a hex colour). Unknown values are ignored, never passed on
  as CSS or HTML. No stylesheet hooks: the widget stays in its shadow root, so any page's CSS
  can't break it and our updates can't break anyone's styling.
- **The defaults are the recommended setup,** not the lowest common denominator. The dashboard,
  the guide and the skill all say so, and agents change options only when asked or when the
  app clearly needs it. Two defaults are new: the logo follows `data-accent` (as the Swift SDK
  already did; `data-mark="heresay"` keeps the teal), and the language follows the page's
  `<html lang>`.
- **Offered:** position (four corners and bottom centre), offset, when the button shows
  (always, never, not on phones, after the first scroll), label, style (pill, icon, side tab),
  size, fill, shadow, pages to hide it on, accent, logo colour, theme, font, language (English,
  French, Tamil and Hindi), placeholder, which report types show, a thank-you line, where the panel opens
  (corner, side sheet, centre), its width, the backdrop, the Preferences tab, the intro timing
  and wording, `open({ type, text })` and `on('sent')`.
- **Not offered:** swapping the icon, the corner shape, the update dot, a pulse, every colour,
  custom CSS, a keyboard shortcut, extra context fields. Each either costs reporters something
  (they recognise the mark; the dot tells them a report changed) or multiplies what we must keep
  looking right.
- **Locked:** the report types' names (the type sets the priority, and the reporter never picks
  a priority), the "Your reports" tab (declines carry a reason the reporter must be able to
  read), and **"Powered by Heresay"**.
- **"Powered by Heresay" is on every view** of the panel and on the introduction, linking to the
  product site, next to "Sent to this app's team". Reporters are members of the public typing
  into what looks like part of the app; they should be able to tell it is an outside tool and
  who reads it. With `data-button="none"` the panel is the only place they see it, which is why
  it can't be turned off. The button's tooltip says it too.
- **The dashboard has a Design page per web app.** It renders the real `sdk.js` in a sandboxed
  iframe with `data-preview` (nothing sent, nothing stored), and outputs only the attributes that
  differ from the defaults, plus a prompt for the coding agent.
- `on('sent')` gets `{ id, type }`, never the text: the host app already has the page, and the
  report text is the reporter's.

## iOS and macOS

- **The same choices, as one `HeresayStyle`** passed to `Heresay.configure(…, style:)`, next to
  the existing `accent:`. Options that only make sense in a browser (after the first scroll, not
  on phones, the page's font, the backdrop, a side tab) have no Swift twin; native ones take
  their place: `typeface` (system, rounded, serif), `sheet` (half height or full screen on
  iPhone, narrower or wider on Mac), and `hiddenOnScreens`, matched against the names the app
  gives `Heresay.setScreen`.
- **Defaults stay native:** a filled accent button on iOS (not the web's neutral pill), and on
  macOS the Help › Report a Problem… menu (⌥⌘R) with no corner button.
- **"Powered by Heresay"** sits above the sheet's bottom bar on every tab, links to the product
  site, and ends the introduction alert.
- **The dashboard's Design page** can't run SwiftUI, so it draws an HTML likeness of the iPhone
  or Mac sheet from the same choices and outputs the `configure` call and the root view.

## Languages

English, French, Tamil and Hindi, on the web and in Swift, from the same words
(`public/sdk.js`, `apple/Sources/Heresay/Words.swift`). A test checks every language has every
string. Server error messages are still English.

## Not now

More languages (each is a full translation we must keep).
