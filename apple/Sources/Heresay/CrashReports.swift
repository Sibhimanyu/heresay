import Foundation

/// Whether a crash is reported without anyone sending it.
///
/// `.off` (the default): a crash waits on the device and goes with the next report someone sends,
/// and `nudge: .crash` offers to report it.
///
/// `.send`: when the app starts after a run that ended badly (a crash, a hang the system killed,
/// running out of memory, a force quit), Heresay reports it at once, as "Broken", with what
/// happened in that run's last five minutes, the app's logged errors and, when macOS or iOS has
/// handed it over, how it crashed. It waits in your inbox like any report; nothing reaches an
/// agent until a person accepts it. Once per run that ended badly, at most three a day per device.
///
/// It is sent through a background upload, which the system finishes even if the app crashes
/// again straight after launching, so an app that crashes on every launch still reports. That
/// only works if `Heresay.configure` runs before the crash: call it first thing at launch.
/// Turning this on sends diagnostics without asking, so say so in your privacy policy and, on the
/// App Store, under "Crash Data" and "Other Diagnostic Data" in your privacy details.
public enum HeresayCrashReports: Sendable, Hashable {
    case off
    case send
}

extension Client {
    /// The background session reports go through when they must outlive the app: the system
    /// finishes the upload even if the app crashes or quits a moment after starting it.
    nonisolated(unsafe) static var backgroundSession: URLSession = {
        let id = "dev.heresay.reports." + (Bundle.main.bundleIdentifier ?? ProcessInfo.processInfo.processName)
        let c = URLSessionConfiguration.background(withIdentifier: id)
        c.isDiscretionary = false
        return URLSession(configuration: c)
    }()

    /// Send a report and don't wait. With the default session it is a background upload that
    /// survives the app; a session passed to `configure` (tests, a custom stack) is used as is.
    func submitSurvivingExit(deviceId: String, type: ReportType, text: String, context: ReportContext,
                             trail: [TrailEvent]?, auto: String) {
        guard session === URLSession.shared else {
            let me = self
            Task.detached { _ = try? await me.submit(deviceId: deviceId, type: type, text: text, context: context, trail: trail, auto: auto) }
            return
        }
        do {
            let req = try request("reports", submitBody(deviceId: deviceId, type: type, text: text, context: context, trail: trail, auto: auto))
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("heresay-report-\(UUID().uuidString).json")
            try req.httpBody?.write(to: file)
            var upload = req
            upload.httpBody = nil
            Self.backgroundSession.uploadTask(with: upload, fromFile: file).resume()
        } catch { /* nothing to send it with; the run stays on the device for the next report */ }
    }
}
