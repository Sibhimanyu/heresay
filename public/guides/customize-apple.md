# Change how Heresay looks in an iOS or macOS app

The defaults are the recommended setup. Change something only when the person asks or the app
clearly needs it. It is one `HeresayStyle`, passed to `Heresay.configure`, plus `accent`. Needs
the Swift package 0.2.11 or later. The dashboard's **Design** page previews it and gives the
Swift; if the person pasted its prompt, do exactly that.

```swift
Heresay.configure(
    key: "KEY",
    url: URL(string: "HERESAY_URL")!,
    accent: Color(red: 0.486, green: 0.227, blue: 0.929),
    style: HeresayStyle(position: .bottomLeading, label: "Feedback")
)
```

## Options

`HeresayStyle(...)` takes these **in this order** (Swift requires it); leave out any you don't
change. The first value is the default.

| Parameter | Values |
| --- | --- |
| `position` | `.bottomTrailing` · `.bottomLeading` · `.topTrailing` · `.topLeading` · `.bottom` |
| `offset` | `16` points from the edges (at most 200) |
| `label` | `nil` ("Report") · any text up to 40 characters |
| `hiddenOnScreens` | `[]` · screen names set with `Heresay.setScreen` |
| `theme` | `.system` · `.light` · `.dark` |
| `language` | `nil` (the app's language) · `"en"` · `"fr"` · `"ta"` · `"hi"`. Others show English. |
| `layout` | `.composer` · `.steps` · `.bar` (last parameter; see Layout) |

On `configure`: `accent:` (a `Color`; the mark follows it) and `style:`. `Heresay.setStyle(_:)`
changes it later.

## Layout

`layout:` is the last `HeresayStyle` parameter and picks how a report opens. The reporter never
sees the choice. All three send the same data, need a type and some text before Send is enabled,
keep the same Sent view and the same Your reports view, show no trail, and hide the floating
Report button while open. `Heresay.present(type:text:)` preselects the type in all of them.

```swift
HeresayStyle(layout: .steps)   // .composer (default) · .steps · .bar
```

**`.composer` (default).** One sheet. Header: mark, "Report", Your reports (with a dot when there
is a reply), close. Then type pills on iOS or a labelled category menu on Mac, a text box whose
question follows the type, Send, and a one-line footer. A hint explains which requirement is
missing while Send is unavailable. Choose it when you have no strong preference: one screen. iPhone: a sheet that fits the form and rises with the keyboard. iPad and Mac: a
regular sheet.

**`.steps`.** Two screens. Screen 1: "What's going on?", Your reports (clock icon with a dot),
close, and four full-width rows (Broken, Confusing, Could be better, Idea), each with an icon and
a chevron, then "Powered by Heresay". Tapping a row goes to screen 2: back, the chosen type as a
pill on iOS or a plain heading on Mac, the text box, Send. Choose it for a guided, friendlier feel or for people who don't know what
to write until they have chosen a kind. `types:` shortens the list. With `present(type:)` it opens
on screen 2. iPhone: a sheet that fits each screen. iPad and Mac: a regular sheet.

**`.bar`.** Compact, not a sheet. A "Type" menu chip on the left (Broken, Confusing, Could be
better, Idea, with icons; it then shows the choice), a one-line text field "Tell the team..." that
grows, and a round send arrow, disabled until there is a type and text. Under it: Your reports,
"Powered by Heresay", close. After Send the bar shows a check, "Sent. Replies show under Your
reports." and Done. Your reports opens the normal Your reports sheet. Choose it when the screen
should stay visible and reports are usually one line. iPhone and iPad: docked at the bottom, above
the keyboard. Mac: a small panel in the window, in the corner `position` names (bottom corners
and `.bottom` dock at the bottom, top ones at the top).

**With no floating button** (`.heresay()` plus your own button calling `Heresay.present()`, or
macOS Help › Report a Problem… with `HeresayCommands`) every layout works the same. Every
`position` works with every layout.

## How it opens

| How it's opened | iPhone | iPad / Mac |
| --- | --- | --- |
| The floating button (`.heresayReportButton()`, any position) | bottom sheet (bar layout: docked bar) | popover beside the button |
| Your own button calling `Heresay.present()`, no `.heresayAnchor()` (recommended) | bottom sheet (bar layout: docked bar) | centred sheet on the window (iPad: form sheet) |
| Your own button with `.heresayAnchor()` (opt-in), which calls `Heresay.present()` | bottom sheet (bar layout: docked bar) | popover pointing at that button |
| `Heresay.present()` from code with no anchor (an error screen, say) | bottom sheet | sheet on the window (iPad: form sheet) |
| Mac menu bar Help › Report a Problem… / ⌥⌘R (`HeresayCommands`) | n/a | sheet on the key window |

Tapping or clicking outside a popover, or swiping down a sheet, closes it; what was typed and the
chosen type are kept for next time (cleared after sending). A Mac window sheet can't be closed by
clicking outside, so use Escape or the close button. The bar layout stays a docked bar everywhere.

## When to change what

| The app has... | Do this |
| --- | --- |
| Its own feedback or help button | `.heresay()` (no floating button) and the button calls `Heresay.present()`: a centred sheet (recommended). Add `.heresayAnchor()` to that button only if the person wants it next to the button (iPad and Mac popover). Ask: "Open Heresay as a centred window (recommended) or next to your button?" |
| macOS | the default: `.heresay()` plus `.commands { HeresayCommands() }` (Help › Report a Problem…, ⌥⌘R) |
| A tab bar or toolbar in the bottom right | `position: .bottomLeading`, or `offset: 80` |
| Screens where the button is in the way | `hiddenOnScreens: ["Checkout"]`, and those screens call `Heresay.setScreen("Checkout")` |
| An error screen | a button calling `Heresay.present(type: .broken, text: "<what failed>")` |

## The mark in your own button

`HeresayMarkIcon()` is the mark sized to the surrounding text and tinted (`HeresayMarkIcon(color: .primary)`
follows the text). `HeresayMark()` is the bare `Shape` for a custom size.

```swift
Button { Heresay.present() } label: {
    Label { Text("Report a problem") } icon: { HeresayMarkIcon() }
}
```

## What to recommend

The design choices worth proposing to the person (own-button mark, wording, where, error screens, brand) are listed with their reasons in guide `install-apple`, "What to recommend". Propose, explain in a sentence, accept their answer; never apply a design change unasked.

## Calls

- `Heresay.identify(id:label:email:)`, `Heresay.identify()` on sign-out.
- `Heresay.introduce()`: the one-time introduction.
- `Heresay.setScreen(_:)`, or `.heresayScreen("Settings")` on a screen's root view.
- `Heresay.present(type:text:)`: opens the sheet, filled in. The person still reviews and sends.
- `Heresay.onSent { event in ... }`: after each send, with `event.id` and `event.type`, never the text.

## The trail

On by default, each report carries what happened in the last few minutes (screens, the app's
`Logger` errors, the last crash, going offline; on macOS clicks and menu commands) and never
what anyone typed. The sheet doesn't show or ask about it; it goes with every report. `.heresayPrivate()` on a view whose controls
are named after someone's data.

## Crash reports

Off by default. `crashReports: .send` on `configure` reports a run that ended badly (a crash, a
hang, out of memory, a force quit) at the next launch, as Broken, waiting in the inbox for a
person. Keep `configure` the first line of `init`. It sends diagnostics without asking: the
privacy policy should say so, and App Store privacy details should list Crash Data and Other
Diagnostic Data.

```swift
Heresay.configure(key: "KEY", url: URL(string: "HERESAY_URL")!, crashReports: .send)
```

## Can't be changed

The Heresay mark, the report types' names, "Your reports" (people must be able to read
why a report was declined), and "Sent to this app's team · Powered by Heresay" at the foot of every view. Don't
cover or remove them.

Other `HeresayStyle` parameters still work (button, size, fill, shadow, markFollowsAccent,
typeface, placeholder, types, thanks, sheet, showsPreferences; showsPreferences now hides the "Your name and email" row at the bottom of Your reports), as do `trail:` and `nudge:` on
`configure` and `Heresay.nudge()`. Leave them as they are in existing apps and don't add them
unless asked.
