// Standalone integration probe: compile with Heresay's sources, then launch as a macOS .app.
// It exercises a real SwiftUI .sheet and internal state changes without relying on accessibility.
import AppKit
import SwiftUI
import Darwin

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
            for _ in 0..<100 {
                if result.initialHeight > 0 { break }
                try? await Task.sleep(for: .milliseconds(50))
            }
            guard result.initialHeight > 0 else { return }
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
        recordPhase("starting")
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
        recordPhase("launched")
        let heresay = Heresay(defaults: UserDefaults(suiteName: "heresay.sheet-sizing-probe")!)
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 800, height: 700),
                          styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.contentView = NSHostingView(rootView: ProbeRoot(result: result, heresay: heresay))
        window.makeKeyAndOrderFront(nil)
        let ready = Timer(timeInterval: 0.1, repeats: true) { [self] timer in
            MainActor.assumeIsolated {
                let height = window.attachedSheet?.contentView?.bounds.height ?? 0
                if height > 0 {
                    result.initialHeight = height
                    recordPhase("sheet ready: \(height)")
                    timer.invalidate()
                }
            }
        }
        RunLoop.main.add(ready, forMode: .common)
        let deadline = Timer(timeInterval: 8, repeats: false) { [self] _ in
            MainActor.assumeIsolated {
                let actual = window.attachedSheet?.contentView?.bounds.height ?? 0
                let passed = result.initialHeight > 0 && result.requiredHeight > result.initialHeight + 50
                    && actual >= result.requiredHeight - 1
                let report = "\(passed ? "PASS" : "FAIL") initial=\(result.initialHeight) required=\(result.requiredHeight) sheet=\(actual)\n"
                try? report.write(toFile: probeResultPath(), atomically: true, encoding: .utf8)
                recordPhase("finished")
                // This standalone test process must exit even if AppKit has an active sheet.
                exit(passed ? 0 : 1)
            }
        }
        RunLoop.main.add(deadline, forMode: .common)
    }
}

private func probeResultPath() -> String {
    ProcessInfo.processInfo.environment["HERESAY_PROBE_RESULT"]
        ?? Bundle.main.object(forInfoDictionaryKey: "HeresayProbeResult") as? String
        ?? "/tmp/heresay-sheet-sizing-result.txt"
}

private func recordPhase(_ phase: String) {
    try? phase.write(toFile: probeResultPath() + ".phase", atomically: true, encoding: .utf8)
}
