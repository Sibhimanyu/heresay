import SwiftUI
import Heresay

@main
struct ExampleApp: App {
    init() {
        // Point these at your Heresay: HERESAY_URL and HERESAY_KEY in the scheme's environment.
        let env = ProcessInfo.processInfo.environment
        Heresay.configure(
            key: env["HERESAY_KEY"] ?? "pk_replace_me",
            url: URL(string: env["HERESAY_URL"] ?? "http://127.0.0.1:5055")!
        )
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
                // For screenshots and demos only: HERESAY_DEMO_SEND sends a report, HERESAY_OPEN opens the sheet.
                let env = ProcessInfo.processInfo.environment
                if env["HERESAY_DEMO_SEND"] == "1" { try? await Heresay.send(.broken, text: "The export button does nothing.") }
                if env["HERESAY_OPEN"] == "1" { try? await Task.sleep(for: .seconds(1)); Heresay.present() }
            }
        }
    }
}
