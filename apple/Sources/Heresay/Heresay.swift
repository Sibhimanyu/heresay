import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if os(macOS)
import AppKit
#endif

/// Heresay: a Report button for your app. People pick what it is (Broken, Confusing, Could be
/// better, Idea), write a sentence, and later see what happened to it.
///
/// ```swift
/// import Heresay
///
/// @main struct MyApp: App {
///     init() { Heresay.configure(key: "pk_…", url: URL(string: "https://your-heresay.web.app")!) }
///     var body: some Scene {
///         WindowGroup { ContentView().heresayReportButton() }   // iOS: a button in the corner
///             .commands { HeresayCommands() }                     // macOS: Help › Report a Problem…
///     }
/// }
/// ```
@MainActor
public final class Heresay: ObservableObject {
    /// The one instance the views read from.
    public static let shared = Heresay()

    @Published public private(set) var reports: [SentReport] = []
    @Published public var isPresented = false
    /// Reports whose outcome this device hasn't looked at yet. Drives the dot on the button.
    @Published public private(set) var unseen = 0
    /// The server doesn't know this key (a 404): the app was deleted from the dashboard, or the
    /// key is wrong. The button and sheet stay hidden until `configure` is called again.
    @Published public private(set) var isDisabled = false
    /// What the person told the team about themselves, in Preferences. Saved on the device.
    @Published public private(set) var prefs = ReporterPrefs()
    /// The tab the sheet opens on next; `present()` picks one if nil.
    @Published var requestedTab: SheetTab?

    var client: Client?
    var accent: Color = .heresayPeacock
    /// The app chose its own accent; then the mark follows it too.
    var customAccent = false
    var markColor: Color { customAccent ? accent : .heresayMark }
    private var version: String?
    private var screen: String?
    private var userId: String?
    @Published private(set) var userLabel: String?
    @Published private(set) var userEmail: String?
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Keys.prefs),
           let saved = try? JSONDecoder().decode(ReporterPrefs.self, from: data) { prefs = saved }
    }

    // MARK: Setup

    /// Call once, early (the `App` initialiser is a good place).
    /// - Parameters:
    ///   - key: The app's key from your Heresay dashboard. It is public; it can't read anything.
    ///   - url: Your Heresay's address, e.g. `https://your-heresay.web.app`.
    ///   - version: Attached to every report. Defaults to the bundle's version and build.
    ///   - accent: Your brand colour for the Send button and selections. Defaults to Heresay peacock.
    public static func configure(key: String, url: URL, version: String? = nil, accent: Color? = nil,
                                 session: URLSession = .shared) {
        shared.configure(key: key, url: url, version: version, accent: accent, session: session)
    }

    func configure(key: String, url: URL, version: String?, accent: Color?, session: URLSession) {
        client = Client(base: url, key: key, session: session)
        isDisabled = false
        self.version = version ?? Self.bundleVersion()
        if let accent { self.accent = accent; customAccent = true }
        Task { await refresh() }
    }

    /// Who is signed in, in your system. Call after sign-in; call with no arguments after sign-out.
    /// Then nobody is asked their name to send a report, and with `email` the team can reply.
    public static func identify(id: String? = nil, label: String? = nil, email: String? = nil) {
        shared.identify(id: id, label: label, email: email)
    }

    func identify(id: String?, label: String?, email: String?) {
        userId = id
        userLabel = label
        userEmail = email
    }

    /// The app said who is signed in.
    var isSignedIn: Bool { userId != nil || userLabel != nil || userEmail != nil }

    /// A name to show for the signed-in person.
    var signedInAs: String? { userLabel ?? userEmail ?? (userId != nil ? "your account" : nil) }

    public static func setVersion(_ version: String?) { shared.version = version }

    /// Name the screen people are on, so reports say where they came from.
    public static func setScreen(_ name: String?) { shared.screen = name }

    /// Open the report sheet from your own button or menu item.
    public static func present() { shared.present() }

    func present(_ tab: SheetTab? = nil) {
        guard !isDisabled else { return }
        requestedTab = tab
        isPresented = true
    }

    /// Open straight to Preferences: name, email for replies, a note about their setup.
    public static func presentPreferences() { shared.present(.preferences) }

    /// Keep what the person chose. Sent with their next report, never before.
    public func save(_ prefs: ReporterPrefs) {
        self.prefs = prefs
        if let data = try? JSONEncoder().encode(prefs) { defaults.set(data, forKey: Keys.prefs) }
    }

    /// Send a report from your own UI instead of the sheet.
    @discardableResult
    public static func send(_ type: ReportType, text: String) async throws -> SentReport {
        try await shared.send(type: type, text: text)
    }

    // MARK: Reports

    func send(type: ReportType, text: String) async throws -> SentReport {
        guard let client else { throw Client.Failure(status: 0, message: "Heresay isn’t configured. Call Heresay.configure(key:url:) first.") }
        do {
            let r = try await client.submit(deviceId: deviceId, type: type, text: text, context: context(), reporter: prefs.reporter(signedIn: isSignedIn))
            reports.insert(r, at: 0)
            return r
        } catch let f as Client.Failure where f.status == 404 {
            disable(client)
            throw f
        }
    }

    /// Fetch what happened to this device's reports.
    public func refresh() async {
        guard let client else { return }
        do {
            reports = try await client.mine(deviceId: deviceId)
            recount()
        } catch let f as Client.Failure where f.status == 404 {
            disable(client)
        } catch {
            // Offline or a server hiccup: keep the button; the next refresh may work.
        }
    }

    /// Only an HTTP 404 gets here, never a network failure, so being offline can't hide the button.
    private func disable(_ client: Client) {
        guard !isDisabled else { return }
        isDisabled = true
        isPresented = false
        print("Heresay: this key isn't known to \(client.base.absoluteString); the app may have been deleted. Remove Heresay.configure(…)")
    }

    /// The outcomes on screen now count as read.
    func markSeen() {
        var seen = seenStatuses
        for r in reports where r.status != .open { seen[r.id] = r.status.rawValue }
        defaults.set(seen, forKey: Keys.seen)
        recount()
    }

    private func recount() {
        let seen = seenStatuses
        unseen = reports.filter { $0.status != .open && seen[$0.id] != $0.status.rawValue }.count
    }

    private var seenStatuses: [String: String] {
        defaults.dictionary(forKey: Keys.seen) as? [String: String] ?? [:]
    }

    // MARK: Context

    /// Random, per device, kept in this app's defaults. It is what lets people see their own
    /// reports and nobody else's; no account needed.
    var deviceId: String {
        if let id = defaults.string(forKey: Keys.device), id.count >= 16 { return id }
        let id = Self.platform + "_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        defaults.set(id, forKey: Keys.device)
        return id
    }

    func context() -> ReportContext {
        ReportContext(
            route: screen, appVersion: version, platform: Self.platform, os: Self.osDescription(),
            browser: nil, userId: userId, userLabel: userLabel, userEmail: userEmail, framework: "swiftui",
            viewport: Self.windowSize()
        )
    }

    /// The size of the window people were looking at, in points.
    static func windowSize() -> String? {
        #if os(macOS)
        let window = NSApplication.shared.keyWindow ?? NSApplication.shared.mainWindow
        // With the sheet up, the key window is the sheet; its parent is the app's window.
        guard let size = (window?.sheetParent ?? window)?.frame.size else { return nil }
        #else
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let size = (scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first)?.bounds.size
        else { return nil }
        #endif
        return "\(Int(size.width.rounded()))x\(Int(size.height.rounded()))"
    }

    nonisolated static var platform: String {
        #if os(macOS)
        "macos"
        #else
        "ios"
        #endif
    }

    static func osDescription() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        #if os(macOS)
        let name = "macOS"
        #elseif os(visionOS)
        let name = "visionOS"
        #else
        let name = UIDevice.current.userInterfaceIdiom == .pad ? "iPadOS" : "iOS"
        #endif
        return "\(name) \(v.majorVersion).\(v.minorVersion)" + (v.patchVersion > 0 ? ".\(v.patchVersion)" : "")
    }

    static func bundleVersion(_ bundle: Bundle = .main) -> String? {
        let short = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        switch (short, build) {
        case let (s?, b?) where s != b: return "\(s) (\(b))"
        case let (s?, _): return s
        case let (nil, b?): return b
        default: return nil
        }
    }

    private enum Keys {
        static let device = "heresay.device_id"
        static let seen = "heresay.seen"
        static let prefs = "heresay.prefs"
    }
}

/// The sheet's three tabs.
enum SheetTab: Hashable { case report, mine, preferences }

extension Color {
    /// Heresay peacock: #0f766e, and a brighter #149e91 in dark mode so it doesn't sink.
    static let heresayPeacock = adaptive(light: (15, 118, 110), dark: (20, 158, 145))
    /// The mark's own colour: deep peacock on light, bright teal on dark, as on the web.
    static let heresayMark = adaptive(light: (11, 94, 87), dark: (45, 212, 191))

    private static func adaptive(light: (CGFloat, CGFloat, CGFloat), dark: (CGFloat, CGFloat, CGFloat)) -> Color {
        #if os(macOS)
        Color(NSColor(name: nil) { a in
            let c = a.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: c.0 / 255, green: c.1 / 255, blue: c.2 / 255, alpha: 1)
        })
        #else
        Color(UIColor { t in
            let c = t.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0 / 255, green: c.1 / 255, blue: c.2 / 255, alpha: 1)
        })
        #endif
    }
}
