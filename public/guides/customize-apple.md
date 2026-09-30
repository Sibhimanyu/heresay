# Change how Heresay looks in an iOS or macOS app

Goal: Heresay fits the app, with the fewest changes. **The defaults are the recommended
setup.** Change something only when the person asks, or when the app clearly needs it (see
"When to change what"). Everything is one `HeresayStyle`, passed to `Heresay.configure`, plus
the accent colour. Needs the Swift package 0.2.11 or later.

The easiest way to choose is the dashboard: open the app, then **Design**. It shows a likeness
of the button and sheet with the choices applied and gives the exact Swift, plus a prompt for
you. If the person pasted that prompt, do what it says and nothing more.

```swift
Heresay.configure(
    key: "KEY",
    url: URL(string: "HERESAY_URL")!,
    accent: Color(red: 0.486, green: 0.227, blue: 0.929),
    style: HeresayStyle(position: .bottomLeading, label: "Feedback")
)
```

## When to change what

| The app has... | Do this |
| --- | --- |
| Its own feedback or help button | `.heresay()` instead of `.heresayReportButton()`, and that button calls `Heresay.present()` |
| A macOS app | keep the default: `.heresay()` plus `.commands { HeresayCommands() }` (Help › Report a Problem…, ⌥⌘R) |
| A tab bar or toolbar in the bottom right | `position: .bottomLeading`, or `offset: 80` to sit above it |
| A brand colour | `accent:` on `configure` (the mark follows it) |
| Only a dark theme, or only a light one | `theme: .dark` or `.light`; otherwise leave it following the app |
| French, Tamil or Hindi users | nothing, if the app is localised into `fr`, `ta` or `hi`; otherwise `language:` with that code |
| An error screen | a button there that calls `Heresay.present(type: .broken, text: "<what failed>")` |
| Screens where a corner button gets in the way (checkout, sign-in) | `hiddenOnScreens: ["Checkout"]`, and those screens call `Heresay.setScreen("Checkout")` |

## Every option

`HeresayStyle(...)` takes these in this order (Swift needs the order); leave out any you don't
change. The first value is the default.

| Parameter | Values |
| --- | --- |
| `position` | `.bottomTrailing` · `.bottomLeading` · `.topTrailing` · `.topLeading` · `.bottom` |
| `offset` | `16` points from the edges (at most 200) |
| `label` | `nil` ("Report", in the sheet's language) · any text up to 40 characters |
| `button` | `.pill` · `.icon` (the label stays as its accessibility label) |
| `size` | `.regular` · `.small` · `.large` |
| `fill` | `.accent` (filled with the accent, white text) · `.neutral` (system material, the mark in the accent) |
| `shadow` | `.soft` · `.none` · `.strong` |
| `hiddenOnScreens` | `[]` · screen names as set with `Heresay.setScreen` |
| `markFollowsAccent` | `true` · `false` (keep the Heresay teal) |
| `theme` | `.system` · `.light` · `.dark` |
| `typeface` | `.system` · `.rounded` · `.serif` |
| `language` | `nil` (the app's language) · `"en"` · `"fr"` · `"ta"` (Tamil) · `"hi"` (Hindi). Others show English. |
| `placeholder` | `nil` · the question in the text box, up to 120 characters |
| `types` | all four · some of `[.broken, .confusing, .improvement, .idea]`. Their names can't change: the type sets the priority. |
| `thanks` | `nil` · a line after "Sent. Thank you.", up to 160 characters. Don't promise a fix. |
| `sheet` | `.regular` · `.compact` (half height on iPhone; narrower on Mac) · `.large` (full screen on iPhone and iPad; wider on Mac) |
| `showsPreferences` | `true` · `false` (hide it when the app calls `identify` and wants nothing else asked) |

`Heresay.setStyle(_:)` changes it later, for example when the app's own theme setting changes.

**Calls**

- `Heresay.present(type:text:)`: opens the sheet, filled in. The person still reviews and sends it.
- `Heresay.onSent { event in ... }`: after each report is sent, with `event.id` and `event.type`, never the text.
- `Heresay.introduce(title:message:)`: the one-time introduction in your own words. Leave the
  words out unless asked; the default says where to find it.

## Can't be changed

The Heresay mark, the report types' names, the Your reports tab (people must be able to read why
a report was declined), and "Powered by Heresay" in the sheet and the introduction. People
should be able to tell the app uses an outside tool. Don't cover or remove them.

After changing it, run the app and look at the button, the open sheet and the introduction.
