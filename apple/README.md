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
| `Heresay.identify(id:label:)` | Who is signed in. Call with no arguments after sign-out. |
| `Heresay.setScreen(_:)` | Name the screen, so reports say where they came from. |
| `Heresay.setVersion(_:)` | Override the version read from the bundle. |
| `Heresay.present()` | Open the sheet from your own button. Use `.heresay()` instead of the corner button. |
| `Heresay.send(_:text:)` | Send from your own UI. |
| `configure(…, accent:)` | Your brand colour. Defaults to Heresay peacock. |

The key is public: it can only send reports. Each device gets a random id (kept in
`UserDefaults`), which is how people see their own reports and nobody else's; no accounts.

## Develop

```sh
swift test                                   # macOS
xcodebuild test -scheme Heresay -destination 'platform=iOS Simulator,name=iPhone 18 Pro'
cd Example && xcodegen && open HeresayExample.xcodeproj    # a tiny app to try it in
```

`npm run e2e:apple` in the main repo sends real reports from macOS and the iOS simulator to the
emulators.
