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
- **Going offline and back.**
- **macOS: clicks and menu commands.** A click by its control's accessibility label
  (`button "Export"`, `toolbar item "Export"`), a menu command by its path
  (`menu "File › Export…"`), including from its keyboard shortcut. Controls SwiftUI draws itself
  only have labels while an assistive app such as VoiceOver is running; AppKit's controls, toolbar
  items and menus always do. iOS records no taps: that would mean swizzling.

Never what anyone typed: fields by their label, secure fields and list rows by their kind only.
Emails, tokens, long numbers, query strings and home-folder paths are blanked on the device and
again on the server. The reporter sees it in the sheet (**Attach what happened**, a chip per kind,
**See it** for every line) and can switch it off or leave a kind out. `trail: [.screens, .errors]`
keeps only those parts; `trail: []` turns it off.

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
arrives with its report.
