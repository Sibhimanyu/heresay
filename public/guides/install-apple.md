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
| The app has its own feedback or help button | `.heresay()` (no corner button); that button calls `Heresay.present()` |
| Something in the bottom-right corner, or a tab bar | `HeresayStyle(position: .bottomLeading)` or `offset: 80`: see `customize-apple` |

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

## 7. Prove it

Call `check_install`: it finds the key in this repo's code by itself (`found_in_code`). Build and
run on a simulator or device and `seen_running` shows the SDK loaded. To test the whole path,
open the Report sheet and send a test; `reports` goes up. The key is public by design; it is fine in source control.
