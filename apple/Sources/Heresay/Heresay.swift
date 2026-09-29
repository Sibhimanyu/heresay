import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
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

    var client: Client?
    var accent: Color = .heresayPeacock
    private var version: String?
    private var screen: String?
    private var userId: String?
    private var userLabel: String?
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
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
        if let accent { self.accent = accent }
        Task { await refresh() }
    }

    /// Who is signed in, in your system. Call after sign-in; call with no arguments after sign-out.
    public static func identify(id: String? = nil, label: String? = nil) {
        shared.userId = id
        shared.userLabel = label
    }

    public static func setVersion(_ version: String?) { shared.version = version }

    /// Name the screen people are on, so reports say where they came from.
    public static func setScreen(_ name: String?) { shared.screen = name }

    /// Open the report sheet from your own button or menu item.
    public static func present() { shared.present() }

    func present() {
        guard !isDisabled else { return }
        isPresented = true
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
            let r = try await client.submit(deviceId: deviceId, type: type, text: text, context: context())
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
            browser: nil, userId: userId, userLabel: userLabel, framework: "swiftui"
        )
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
    }
}

extension Color {
    /// Heresay peacock, #0f766e.
    static let heresayPeacock = Color(red: 15 / 255, green: 118 / 255, blue: 110 / 255)
}
