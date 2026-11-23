# Add Heresay to an iOS or macOS app

Goal: people can open a Report sheet from inside the app, and the first report reaches the
dashboard. Needs iOS 16 or macOS 13, and SwiftUI (a UIKit or AppKit app can host it in a
`UIHostingController` / `NSHostingController`).

## 1. Find or create the app

`list_apps` shows the apps connected to this repo. If none is this app, `create_app` with a name
and `platform: "ios"` or `"macos"`. Native apps don't list sites.

## 2. Add the package

Add the Swift package `SWIFT_PACKAGE` (product `Heresay`) to the app target: in Xcode, File ›
Add Package Dependencies; in a `Package.swift`,
`.package(url: "SWIFT_PACKAGE", from: "0.2.0")`. If the project uses XcodeGen or Tuist, add it
there instead of editing the `.xcodeproj` by hand.

## 3. Configure once, and put it on screen

In the `App` struct:

```swift
import Heresay

@main
struct MyApp: App {
    init() {
        Heresay.configure(key: "KEY", url: URL(string: "HERESAY_URL")!)   // first line of init
    }
    var body: some Scene {
        WindowGroup {
            ContentView().heresayReportButton()   // iOS: a Report button in the corner
        }
    }
}
```

| Platform or case | Do this |
| --- | --- |
| iOS | `.heresayReportButton()` on the root view |
| macOS | `.heresay()` on the root view, and `.commands { HeresayCommands() }` on the `WindowGroup` (Help › Report a Problem…, ⌥⌘R) |
| The app has its own feedback or help button | `.heresay()` (no corner button) and the button calls `Heresay.present()`: a centred sheet, the recommended default. Add `.heresayAnchor()` to that button only if the person wants it next to the button (a popover pointing at it on iPad and Mac). **Ask the person:** "Open Heresay as a centred window (recommended) or next to your button?" |
| Something in the bottom-right corner, or a tab bar | `HeresayStyle(position: .bottomLeading)` or `offset: 80`: see `customize-apple` |

How it opens: the floating button and an anchored button (`.heresayAnchor()`) open a bottom sheet on
iPhone (bar layout: docked bar) and a popover on iPad and Mac; `Heresay.present()` with no anchor, the
recommended way from the app's own button, opens a centred sheet (iPad: form sheet); Mac
Help › Report a Problem… opens a sheet on the window. The dashboard's Design page shows both.

## 4. Who is signed in (required if people sign in)

Where the app learns who is signed in, and on sign-out:

```swift
Heresay.identify(id: user.id, label: user.name, email: user.email)
Heresay.identify()   // after sign-out
```

## 5. Tell people it's there (required)

Call `Heresay.introduce()` once the main screen shows, after sign-in and onboarding, never over a
login or first-run screen. Once per install it shows where to find Heresay and offers to open
it. Later calls do nothing. Don't build your own dialog. If the app has a "What's new" screen,
add a line there too.

```swift
MainView().onAppear { Heresay.introduce() }
```

## 6. Optional

- `Heresay.setScreen("Checkout")` in `.onAppear` of the main screens.
- `accent: .purple` on `configure` for a brand colour.
- The version is read from the bundle.

Leave everything else; the defaults are recommended. Change nothing else in the app.

## What to recommend

Propose each of these when it applies, say why in one sentence, and accept the person's answer. Never
apply a design change without asking; the person decides.

- **The app's own button keeps the Heresay mark.** Mark plus label, or a round mark-only button; Swift: `Label { Text("Report a problem") } icon: { HeresayMarkIcon() }` (sizes to the font, tinted; `HeresayMark()` is the bare shape). Why: people recognise the mark from app to app.
- **Floating button: a pill with the mark and "Report" (the default).** Icon-only round only when space is tight; never a bare text link. Why: the pill is the easiest to find.
- **Wording: short and neutral.** "Report", "Feedback" or "Report a problem"; never "Bug", "Complaint" or "Contact support". Why: people hold back when it sounds like blame or a ticket.
- **Where: where people look when stuck.** Bottom of the sidebar, the Help menu, or a header help icon; never buried in Settings. Why: a report is made in the moment of frustration.
- **Error screens and empty states: a "Tell the team" link** calling `Heresay.present(type: .broken, text:)`. Why: that is when people most want to say something, and the text arrives filled in.
- **Brand: the app's accent colour** (`Heresay.configure(…, accent: .purple)`); the mark follows it. Why: it looks like part of the app.
- **Mac: always the Help menu.** `.commands { HeresayCommands() }` gives Help › Report a Problem… and ⌥⌘R, even when the app also has a button. Why: it is where Mac users look, and the shortcut is the same in every app.
- **First run:** `introduce()` once on the main screen, and `identify` when people sign in. Why: people learn the button exists, and nobody is asked their name.
- **Layout: composer** unless the app clearly suits steps (consumer, mobile-first) or bar (dense pro tools). Why: composer is the quickest to fill in.
- **Own button opens:** centred (recommended, the default); `.heresayAnchor()` only if the person asks. Why: a centred window never hides what the person is reporting on.
- **iPad toolbar.** A button in the navigation-bar toolbar must stay centred (no `.heresayAnchor()`): an anchored popover there covers the button.

## 7. Prove it

Call `check_install`: it finds the key in this repo's code by itself (`found_in_code`). Build and
run on a simulator or device and `seen_running` shows the SDK loaded. To test the whole path,
open the Report sheet and send a test; `reports` goes up. The key is public by design; it is fine in source control.
