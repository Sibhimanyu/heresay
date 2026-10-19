# Heresay for iOS and macOS

A Report button for SwiftUI apps. People pick what it is (Broken, Confusing, Could be better,
Idea), write a sentence, and later see what happened to it, including the note you write when
it's fixed. Reports go to your own Heresay (set one up with `npx create-heresay`).

iOS 16+, macOS 13+. No dependencies.

## Install

Xcode: **File › Add Package Dependencies…** → `https://github.com/Sibhimanyu/heresay-swift`

Package.swift: `.package(url: "https://github.com/Sibhimanyu/heresay-swift", from: "0.2.0")`

## Use

```swift
import SwiftUI
import Heresay

@main
struct MyApp: App {
    init() {
        Heresay.configure(key: "pk_…", url: URL(string: "https://your-heresay.web.app")!)
    }
    var body: some Scene {
        WindowGroup {
            ContentView().heresayReportButton()      // iOS: Report button in the corner
        }
    }
}
```

macOS: use `ContentView().heresay()` and add `.commands { HeresayCommands() }` to the
`WindowGroup` for **Help › Report a Problem…** (⌥⌘R).

| Call | What it does |
| --- | --- |
| `Heresay.identify(id:label:email:)` | Who is signed in. Then nobody is asked their name, and with `email` you can reply. Call with no arguments after sign-out. |
| `Heresay.introduce()` | Once per install, a welcome sheet on iOS or a small window on macOS saying Heresay is there and where (Help › Report a Problem… on macOS). Call it when the main screen appears, after sign-in and onboarding. |
| `Heresay.presentPreferences()` | Open the sheet on Preferences: a note about their setup (and a name and email when not signed in). |
| `Heresay.setScreen(_:)` | Name the screen, so reports say where they came from. |
| `Heresay.setVersion(_:)` | Override the version read from the bundle. |
| `Heresay.present(type:text:)` | Open the sheet from your own button, optionally filled in. Use `.heresay()` instead of the corner button. |
| `Heresay.onSent { event in }` | After each report is sent: `event.id` and `event.type`, never the text. |
| `Heresay.send(_:text:)` | Send from your own UI. |
| `configure(…, accent:)` | Your brand colour; the mark follows it. Defaults to Heresay peacock. |
| `configure(…, style:)` | How it looks: see below. `Heresay.setStyle(_:)` changes it later. |
| `configure(…, trail:)` | What happened before a report: see below. `.all` by default, `[]` for none. |
| `configure(…, nudge:)` | Offer to report when someone seems stuck: see below. Off by default. |
| `Heresay.nudge()` | The app saw trouble itself (an error screen, a retry that failed): a small note offers to report it. |
| `.heresayScreen(_:)` | On a screen's view: names it while it's shown, the same as `setScreen` in `onAppear`. |
| `.heresayPrivate()` | On a view whose controls are named after someone's data: its clicks are recorded without labels. |

## How it looks

The defaults are the recommended setup; change only what your app needs. The dashboard's
**Design** page shows each choice and gives the code.

```swift
Heresay.configure(key: "pk_…", url: url, accent: .purple, style: HeresayStyle(
    position: .bottomLeading,        // .bottomTrailing, .topTrailing, .topLeading, .bottom
    offset: 16,                      // points from the edges
    label: "Feedback",               // default "Report", in the sheet's language
    button: .pill,                   // or .icon
    size: .regular,                  // .small, .large
    fill: .accent,                   // or .neutral: system material, the mark in your colour
    shadow: .soft,                   // .none, .strong
    hiddenOnScreens: ["Checkout"],   // names from Heresay.setScreen
    markFollowsAccent: true,
    theme: .system,                  // .light, .dark
    typeface: .system,               // .rounded, .serif
    language: nil,                   // the app's; or "en", "fr", "ta" (Tamil), "hi" (Hindi)
    placeholder: nil,
    types: [.broken, .confusing, .improvement, .idea],
    thanks: nil,                     // a line after "Sent. Thank you."
    sheet: .regular,                 // .compact (half height on iPhone), .large (full screen)
    showsPreferences: true
))
```

Always there: the Heresay mark, the report types' names (the type sets the priority), the Your
reports tab, and "Powered by Heresay" in the sheet and the introduction, so people can tell the
app uses an outside tool.

## What happened before a report

Each report carries the last five minutes in the app, the same as the web widget sends:

- **Screens**, as named with `Heresay.setScreen` or `.heresayScreen(_:)`.
- **The app's own errors**: `Logger` lines at `.error` and `.fault` (Apple's frameworks left
  out), read from the app's log only when someone reports. Log a failure and it shows up here.
- **The last crash**, from MetricKit at the next launch, sent with one report.
- **What happened before the app closed unexpectedly.** The trail is written to disk as it
  happens, so after a crash, a hang the system killed or running out of memory, the next report
  carries the last run's final five minutes, timed back from when it ended, and a line such as
  "The app closed unexpectedly 4 s after launch, on the first launch after updating from 1.3 to
  1.4". The app's own `Logger` errors are read once a minute while it's in front, so they're in
  it too (a look at the log costs about a second and a half of one core, hence not more often).
- **Going offline and back**, leaving the app and coming back, the device running hot, and on
  iOS the system warning that memory is low.
- **macOS: clicks and menu commands.** A click by its control's accessibility label
  (`button "Export"`, `toolbar item "Export"`), a menu command by its path
  (`menu "File › Export…"`), including from its keyboard shortcut. Controls SwiftUI draws itself
  only have labels while an assistive app such as VoiceOver is running; AppKit's controls, toolbar
  items and menus always do. iOS records no taps: that would mean swizzling.

Each report also carries the device around the app: the model (`iPhone16,1`, `MacBookPro18,3`),
screen and scale, light or dark, language, time zone, connection (`wifi`, `cellular, low data`,
`offline`), how long the app has been open, and settings that change how it looks or runs
(reduced motion, more contrast, bold or larger text, low power). They are listed under **See it**.

Never what anyone typed: fields by their label, secure fields and list rows by their kind only.
Emails, tokens, long numbers, query strings and home-folder paths are blanked on the device and
again on the server. The reporter sees it in the sheet (**Attach what happened**, a chip per kind,
**See it** for every line) and can switch it off or leave a kind out. `trail: [.screens, .errors]`
keeps only those parts; `trail: []` turns it off.

## Offering help

`nudge: .all` in `configure` watches for someone stuck and puts a small note by the button (on
macOS, in the window's corner): "Something not working?", with **Tell the team**, which opens the
sheet as Broken with the trail, and **Not now**. It takes no focus, VoiceOver announces it, and it
goes by itself after 15 seconds unless the pointer is on it.

- `.clicks` (macOS): a disabled control clicked 3 times in 10 seconds, or one spot clicked 5 times
  in 2 seconds. Text, sliders, steppers and scroll bars don't count. Leave it out for games and
  drawing apps.
- `.crash`: the app crashed last time (MetricKit). Offered once, at the next launch.
- `.circles`: 6 screen changes in a minute among at most 3 screens, one seen 3 times. Needs
  screens named with `setScreen` or `.heresayScreen(_:)`.
- `.stalled`: typed in a field, then 45 seconds with the field still being edited (on iOS, the
  keyboard still up), the app in front and the same screen. Search fields don't count. Only that
  something was typed is noticed, never what.

`.circles` and `.stalled` say "Stuck on something?" and open the sheet as Confusing;
`Heresay.nudge(stuck: true)` does the same from the app's code.

Watched on the device; nothing is sent unless the person sends a report. At most once per launch.
`Heresay.nudge()` offers it from the app's own code, with the
same limits. iOS has no taps to watch, so there it is `.crash`, `.circles`, `.stalled` and `nudge()`.

The key is public: it can only send reports. Each device gets a random id (kept in
`UserDefaults`), which is how people see their own reports and nobody else's; no accounts.

If the server doesn't know the key (the app was deleted from the dashboard, or the key is
wrong), Heresay hides itself: the button and sheet stop showing, `Heresay.present()` does
nothing, `Heresay.shared.isDisabled` is `true`, and one warning is printed. Being offline never
hides it.

## Develop

```sh
swift test                                   # macOS
xcodebuild test -scheme Heresay -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
cd Example && xcodegen && open HeresayExample.xcodeproj    # a tiny app to try it in
```

`npm run e2e:apple` in the main repo sends real reports from macOS and the iOS simulator to the
emulators, then uses the example Mac app (`HERESAY_DEMO_TRAIL=1`) and checks the trail that
arrives with its report. `HERESAY_DEMO_NUDGE=/tmp/shot` makes the example app click Sync now five
times fast, for the note offering help.
