import SwiftUI
import Heresay

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
        #endif
    }
}

/// Stands in for a real app.
struct NotesView: View {
    var body: some View {
        NavigationStack {
            List {
                ForEach(["Groceries", "Trip to Ooty", "Quarterly plan", "Book list"], id: \.self) { Text($0) }
            }
            .navigationTitle("Notes")
            .onAppear { Heresay.setScreen("Notes") }
            .task {
                // For screenshots and demos only: HERESAY_DEMO_SEND sends a report, HERESAY_OPEN opens
                // the sheet (=preferences for that tab), HERESAY_SIGNED_IN plays a signed-in user.
                let env = ProcessInfo.processInfo.environment
                // The main screen is up: introduce Heresay, once per install (HERESAY_INTRO=1 for demos).
                if env["HERESAY_INTRO"] == "1" { Heresay.introduce() }
                if env["HERESAY_SIGNED_IN"] == "1" { Heresay.identify(id: "u_42", label: "Sibhi Govindasamy", email: "sibhi@example.com") }
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
