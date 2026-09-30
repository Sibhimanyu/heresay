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

## 3. Configure it once, and put it on screen

In the `App` struct:

```swift
import Heresay

@main
struct MyApp: App {
    init() {
        Heresay.configure(key: "KEY", url: URL(string: "HERESAY_URL")!)
    }
    var body: some Scene {
        WindowGroup {
            ContentView().heresayReportButton()   // iOS: a Report button in the corner
        }
    }
}
```

On macOS use `ContentView().heresay()` and add `.commands { HeresayCommands() }` to the
`WindowGroup`: that adds Help › Report a Problem… (⌥⌘R). Apps with their own feedback button
call `Heresay.present()` from it and use `.heresay()` instead of the corner button.

## 4. Who is signed in (required if people sign in)

Where the app learns who is signed in, and on sign-out:

```swift
Heresay.identify(id: user.id, label: user.name, email: user.email)
Heresay.identify()   // after sign-out
```

Then nobody is asked their name to send a report, and the team can reply to them.

## 5. Tell people it's there (required)

On macOS the report window lives under Help, and on iOS it's a small button; people who have never
seen it won't go looking. Call `Heresay.introduce()` once the person reaches the app's main
screen: after sign-in and after any onboarding, never over a login or first-run screen. Once per
install it shows a welcome sheet on iOS, or a small window of its own on macOS, that says where to find it (Help › Report a Problem… (⌥⌘R) on
macOS, the Report button on iOS) and offers to open it. Later calls do nothing, so this is fine:

```swift
MainView()
    .onAppear { Heresay.introduce() }
```

If the app already has a "What's new" or announcements screen, add a line there too. Don't
build a custom dialog for this; `introduce()` is the one.

## 6. Optional

- Screens: `Heresay.setScreen("Checkout")` in `.onAppear` of the main screens.
- The app version is read from the bundle (`CFBundleShortVersionString` and build).
- A brand colour: `Heresay.configure(key:url:accent: .purple)`. The mark follows it.

Everything else about the look (corner, text, size, theme, language, sheet size) is optional and
has a recommended default: leave it unless the person asks. Guide `customize-apple` lists every
option; the dashboard's **Design** page shows them. Change nothing else in the app.

## 7. Prove it

Call `check_install`: it finds the key in this repo's code by itself (`found_in_code`). Build and
run on a simulator or device and `seen_running` shows the SDK loaded. To test the whole path,
open the Report sheet and send a test; `reports` goes up. The key is public by design; it is fine in source control.
