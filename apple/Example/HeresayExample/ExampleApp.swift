import SwiftUI
import OSLog
import Heresay
#if os(macOS)
import AppKit
#endif

/// The app's own log. Heresay attaches its errors to the next report (the trail).
let log = Logger(subsystem: "dev.heresay.example.notes", category: "export")

@main
struct ExampleApp: App {
    init() {
        // Point these at your Heresay: HERESAY_URL and HERESAY_KEY in the scheme's environment.
        let env = ProcessInfo.processInfo.environment
        Heresay.configure(
            key: env["HERESAY_KEY"] ?? "pk_replace_me",
            url: URL(string: env["HERESAY_URL"] ?? "http://127.0.0.1:5055")!,
            accent: env["HERESAY_ACCENT"].flatMap(Self.color),
            style: Self.demoStyle(env)
        )
    }

    /// For screenshots of the options: HERESAY_LANG, HERESAY_LABEL, HERESAY_POSITION, HERESAY_BUTTON,
    /// HERESAY_FILL, HERESAY_THEME, HERESAY_SHEET, HERESAY_TYPES, HERESAY_THANKS. A real app writes
    /// `HeresayStyle(...)` with what it wants; the defaults are the recommended setup.
    static func demoStyle(_ env: [String: String]) -> HeresayStyle {
        HeresayStyle(
            position: env["HERESAY_POSITION"].flatMap(HeresayStyle.Position.init) ?? .bottomTrailing,
            label: env["HERESAY_LABEL"],
            button: env["HERESAY_BUTTON"].flatMap(HeresayStyle.ButtonKind.init) ?? .pill,
            fill: env["HERESAY_FILL"].flatMap(HeresayStyle.Fill.init) ?? .accent,
            theme: env["HERESAY_THEME"].flatMap(HeresayStyle.Theme.init) ?? .system,
            language: env["HERESAY_LANG"],
            types: env["HERESAY_TYPES"]?.split(separator: ",").compactMap { ReportType(rawValue: String($0)) } ?? ReportType.allCases,
            thanks: env["HERESAY_THANKS"],
            sheet: env["HERESAY_SHEET"].flatMap(HeresayStyle.Sheet.init) ?? .regular
        )
    }

    static func color(_ hex: String) -> Color? {
        guard let v = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) else { return nil }
        return Color(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }

    var body: some Scene {
        WindowGroup {
            #if os(macOS)
            NotesView().heresay().frame(minWidth: 520, minHeight: 420)
            #else
            NotesView().heresayReportButton()
            #endif
        }
        #if os(macOS)
        .commands { HeresayCommands() }
        .commands {
            CommandMenu("Notes") {
                Button("Export All…") { NotesView.export() }.keyboardShortcut("e", modifiers: [.command, .shift])
            }
        }
        #endif
    }
}

/// Stands in for a real app.
struct NotesView: View {
    /// Where Sync now is, for HERESAY_DEMO_TRAIL to click it.
    @MainActor static var syncFrame: CGRect = .zero

    /// Fails, the way a real bug would, and says so in the app's log.
    static func export() {
        log.error("Export failed: the server said 500 for /v1/notes/export")
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(["Groceries", "Trip to Ooty", "Quarterly plan", "Book list"], id: \.self) { Text($0) }
            }
            .safeAreaInset(edge: .bottom) {
                HStack {
                    Spacer()
                    Button("Sync now") { log.error("Sync failed: the connection was lost") }
                        .background(GeometryReader { g in Color.clear.onAppear { Self.syncFrame = g.frame(in: .global) } })
                }
                .padding(12)
            }
            .navigationTitle("Notes")
            .toolbar {
                Button { Self.export() } label: { Label("Export", systemImage: "square.and.arrow.up") }
                    .help("Export")
            }
            .heresayScreen("Notes")
            .task {
                // For screenshots and demos only: HERESAY_DEMO_SEND sends a report, HERESAY_OPEN opens
                // the sheet (=preferences for that tab), HERESAY_SIGNED_IN plays a signed-in user.
                let env = ProcessInfo.processInfo.environment
                // The main screen is up: introduce Heresay, once per install (HERESAY_INTRO=1 for demos).
                if env["HERESAY_INTRO"] == "1" { Heresay.introduce() }
                if env["HERESAY_SIGNED_IN"] == "1" { Heresay.identify(id: "u_42", label: "Sibhi Govindasamy", email: "sibhi@example.com") }
                #if os(macOS)
                // HERESAY_DEMO_TRAIL plays someone using the app before reporting (the trail);
                // HERESAY_SNAPSHOT=path opens the sheet for a screenshot of it.
                if env["HERESAY_DEMO_TRAIL"] == "1" { await Self.playTrail() }
                if let path = env["HERESAY_SNAPSHOT"] {
                    Heresay.present(type: .broken, text: "I clicked Export and nothing happened.")
                    await Self.snapshotSheet(to: path)
                }
                #endif
                if env["HERESAY_DEMO_SEND"] == "1" { try? await Heresay.send(.broken, text: "The export button does nothing.") }
                switch env["HERESAY_OPEN"] {
                case "1": try? await Task.sleep(for: .seconds(1)); Heresay.present()
                case "preferences": try? await Task.sleep(for: .seconds(1)); Heresay.presentPreferences()
                default: break
                }
            }
        }
    }
}

#if os(macOS)
extension NotesView {
    /// Clicks a row, Sync now and Export (real mouse events through the app's queue), uses
    /// Notes › Export All…, and goes to Settings and back.
    @MainActor static func playTrail() async {
        try? await Task.sleep(for: .seconds(1.5))
        guard let w = NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain }) else { return }
        w.makeKeyAndOrderFront(nil)
        // SwiftUI's global frame is from the window's top left; AppKit's from its bottom left.
        let row = NSPoint(x: w.contentLayoutRect.midX, y: w.contentLayoutRect.maxY - 60)
        let sync = NSPoint(x: syncFrame.midX, y: w.frame.height - syncFrame.midY)
        // Sync now is drawn by SwiftUI, so its click has no label unless an assistive app is
        // running; its logged error still goes in the trail.
        var points = [row, sync]
        if let v = w.toolbar?.items.first(where: { $0.label == "Export" })?.view {
            points.append(v.convert(NSPoint(x: v.bounds.midX, y: v.bounds.midY), to: nil))
        }
        for p in points {
            for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                if let e = NSEvent.mouseEvent(with: type, location: p, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                              windowNumber: w.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) {
                    NSApp.postEvent(e, atStart: false)
                }
            }
        }
        try? await Task.sleep(for: .seconds(0.5))
        if let notes = NSApp.mainMenu?.item(withTitle: "Notes")?.submenu, let i = notes.items.firstIndex(where: { $0.title == "Export All…" }) {
            notes.performActionForItem(at: i)
        }
        Heresay.setScreen("Settings")
        try? await Task.sleep(for: .seconds(0.3))
        Heresay.setScreen("Notes")
        try? await Task.sleep(for: .seconds(0.5))
    }

    /// For screenshots: the sheet scrolled to the trail, and its window number in `path.wid` for
    /// `screencapture -l`. The demo app only.
    @MainActor static func snapshotSheet(to path: String) async {
        try? await Task.sleep(for: .seconds(1.5))
        guard let sheet = NSApp.windows.first(where: { $0.isSheet && $0.isVisible }), let view = sheet.contentView else { return }
        NSApp.activate(ignoringOtherApps: true)
        sheet.makeKey()
        func scrollViews(_ v: NSView) -> [NSScrollView] { ((v as? NSScrollView).map { [$0] } ?? []) + v.subviews.flatMap(scrollViews) }
        for sv in scrollViews(view) { if let doc = sv.documentView { doc.scroll(NSPoint(x: 0, y: doc.isFlipped ? doc.bounds.height : 0)) } }
        try? await Task.sleep(for: .seconds(0.4))
        try? "\(sheet.windowNumber)".write(toFile: path + ".wid", atomically: true, encoding: .utf8)
    }
}
#endif
