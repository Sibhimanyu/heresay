// Standalone integration probe: compile with Heresay's sources, then launch as a macOS .app.
// It exercises a real SwiftUI .sheet and internal state changes without relying on accessibility.
import AppKit
import SwiftUI

@MainActor final class ProbeResult {
    var requiredHeight: CGFloat = 0
    var initialHeight: CGFloat = 0
}

private struct GrowingPanel: View {
    let result: ProbeResult
    let heresay: Heresay
    @State private var expanded = false

    var body: some View {
        VStack(spacing: 0) {
            Text("Report").padding(24)
            // Internal state changes the content's height, just as picking a report type does.
            Color.gray.frame(height: expanded ? 280 : 180)
            SheetFooter(heresay: heresay)
        }
        .modifier(MacReportPanelSizing(width: 480))
        .task {
            try? await Task.sleep(for: .milliseconds(800))
            result.requiredHeight = result.initialHeight + 100
            withAnimation(.easeInOut(duration: 0.25)) { expanded = true }
        }
    }
}

private struct ProbeRoot: View {
    let result: ProbeResult
    let heresay: Heresay
    @State private var shown = false
    var body: some View {
        Color.gray
            .sheet(isPresented: $shown) { GrowingPanel(result: result, heresay: heresay) }
            .task { shown = true }
    }
}

@main enum SheetSizingProbe {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = ProbeDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor private final class ProbeDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let result = ProbeResult()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let heresay = Heresay(defaults: UserDefaults(suiteName: "heresay.sheet-sizing-probe")!)
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 800, height: 700),
                          styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.contentView = NSHostingView(rootView: ProbeRoot(result: result, heresay: heresay))
        window.makeKeyAndOrderFront(nil)
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [self] _ in
            MainActor.assumeIsolated { result.initialHeight = window.attachedSheet?.contentView?.bounds.height ?? 0 }
        }
        Timer.scheduledTimer(withTimeInterval: 2.5, repeats: false) { [self] _ in
            MainActor.assumeIsolated {
                let actual = window.attachedSheet?.contentView?.bounds.height ?? 0
                let passed = result.initialHeight > 0 && result.requiredHeight > result.initialHeight + 50
                    && actual >= result.requiredHeight - 1
                let report = "\(passed ? "PASS" : "FAIL") initial=\(result.initialHeight) required=\(result.requiredHeight) sheet=\(actual)\n"
                let path = ProcessInfo.processInfo.environment["HERESAY_PROBE_RESULT"]
                    ?? Bundle.main.object(forInfoDictionaryKey: "HeresayProbeResult") as? String
                    ?? "/tmp/heresay-sheet-sizing-result.txt"
                try? report.write(toFile: path, atomically: true, encoding: .utf8)
                NSApp.terminate(nil)
            }
        }
    }
}
