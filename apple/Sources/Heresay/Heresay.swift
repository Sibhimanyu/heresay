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
    public static let shared = Heresay(boxDir: BlackBox.defaultDir())

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
    /// The one-time introduction is waiting to be shown.
    @Published var introPending = false
    /// The app's own words for the introduction, if it gave any.
    var introWords: (title: String?, message: String?) = (nil, nil)
    /// The note asking whether they want to tell the team (`Nudge.swift`), while it is up.
    @Published private(set) var offer: HelpOffer?
    private var offeredThisLaunch = false
    private(set) var nudges: HeresayNudge = []
    #if os(macOS)
    private lazy var nudgeWatcher = NudgeWatcher()
    #endif
    private lazy var stallWatcher = StallWatcher()
    private var circles = CircleWatch()
    /// What `present(type:text:)` filled in, for the sheet to start with.
    var draft: (type: ReportType?, text: String) = (nil, "")
    /// How it looks. The defaults are the recommended setup.
    @Published public private(set) var style = HeresayStyle()
    /// The sheet's language, from the style or the app.
    @Published private(set) var words = Words(nil)
    private var sentHandlers: [@MainActor (SentEvent) -> Void] = []
    /// How people reach it, so the introduction can say where to look.
    var hasButton = false
    nonisolated(unsafe) static var hasMenuCommand = false

    var client: Client?
    var accent: Color = .heresayPeacock
    /// The app chose its own accent; then the mark follows it too.
    var customAccent = false
    var markColor: Color { customAccent && style.markFollowsAccent ? accent : .heresayMark }
    private var version: String?
    /// The screen named with `setScreen`, which also decides `style.hiddenOnScreens`.
    @Published private(set) var screen: String?
    private var userId: String?
    @Published private(set) var userLabel: String?
    @Published private(set) var userEmail: String?
    private let defaults: UserDefaults
    /// What happened before a report (`Trail.swift`). In memory; leaves only with a report.
    let trail = Trail()
    private lazy var collectors = TrailCollectors(trail: trail, defaults: defaults)
    /// The trail on disk, so it outlives a crash. None in tests unless they give a folder.
    let blackBox: BlackBox?
    private var logTimer: Timer?

    init(defaults: UserDefaults = .standard, boxDir: URL? = nil) {
        self.defaults = defaults
        blackBox = boxDir.map(BlackBox.init(dir:))
        if let data = defaults.data(forKey: Keys.prefs),
           let saved = try? JSONDecoder().decode(ReporterPrefs.self, from: data) { prefs = saved }
    }

    // MARK: Setup

    /// Call once, early (the `App` initialiser is a good place).
    /// - Parameters:
    ///   - key: The app's key from your Heresay dashboard. It is public; it can't read anything.
    ///   - url: Your Heresay's address, e.g. `https://your-heresay.web.app`.
    ///   - version: Attached to every report. Defaults to the bundle's version and build.
    ///   - accent: Your brand colour for the button, Send and selections; the mark follows it too.
    ///     Defaults to Heresay peacock.
    ///   - style: Where the button sits, its text, size, theme, language and more. The defaults
    ///     are the recommended setup.
    ///   - trail: What happened in the app before a report, attached unless the reporter switches
    ///     it off: screens, clicks and menu commands (macOS), the app's `Logger` errors and the last
    ///     crash. `[]` turns it off; `[.screens, .errors]` keeps only those.
    ///   - nudge: When someone seems stuck, offer to report it: `.clicks` (macOS), `.crash`, or
    ///     `.all`. Off by default. `Heresay.nudge()` offers it from the app's own code.
    public static func configure(key: String, url: URL, version: String? = nil, accent: Color? = nil,
                                 style: HeresayStyle = HeresayStyle(), trail: HeresayTrail = .all,
                                 nudge: HeresayNudge = [], session: URLSession = .shared) {
        shared.configure(key: key, url: url, version: version, accent: accent, style: style, trail: trail, nudge: nudge, session: session)
    }

    func configure(key: String, url: URL, version: String?, accent: Color?, style: HeresayStyle = HeresayStyle(),
                   trail parts: HeresayTrail = .all, nudge: HeresayNudge = [], session: URLSession) {
        client = Client(base: url, key: key, session: session)
        isDisabled = false
        self.version = version ?? Self.bundleVersion()
        if let accent { self.accent = accent; customAccent = true }
        setStyle(style)
        collectors.start(parts) { [weak self] in Task { @MainActor in self?.crashArrived() } }
        startBlackBox(parts)
        if let screen { trail.note(.page, screen) }
        nudges = nudge
        #if os(macOS)
        if nudge.contains(.clicks) { nudgeWatcher.start(self) } else { nudgeWatcher.stop() }
        #endif
        if nudge.contains(.stalled) { stallWatcher.start(self) } else { stallWatcher.stop() }
        circles.reset()
        // A crash MetricKit handed over on an earlier launch, not yet offered. After a moment, so
        // the app's window is up.
        if nudge.contains(.crash), Trail.lastCrash(defaults) != nil || blackBox?.lastRun() != nil {
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(1.5))
                self?.crashArrived()
            }
        }
        Task { await refresh() }
    }

    /// Change the look after `configure`, for example when the app's theme changes.
    public static func setStyle(_ style: HeresayStyle) { shared.setStyle(style) }

    func setStyle(_ style: HeresayStyle) {
        self.style = style
        words = Words(style.language)
    }

    /// The button's text: the app's own, or "Report" in the sheet's language.
    var buttonLabel: String { style.label ?? words[.report] }

    /// The corner button shows here: not on the screens the style hides it on.
    var buttonVisible: Bool { !isDisabled && !(screen.map(style.hiddenOnScreens.contains) ?? false) }

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
    var signedInAs: String? { userLabel ?? userEmail ?? (userId != nil ? words[.yourAccount] : nil) }

    public static func setVersion(_ version: String?) { shared.version = version }

    /// Name the screen people are on, so reports say where they came from.
    public static func setScreen(_ name: String?) { shared.setScreen(name) }

    func setScreen(_ name: String?, now: Date = Date()) {
        if let name, name != screen {
            trail.note(.page, name)
            if nudges.contains(.circles), circles.visit(name, at: now) { offerHelp(.stuck, now: now) }
        }
        screen = name
    }

    /// Open the report sheet from your own button or menu item. `type` and `text` fill it in,
    /// for example from an error screen; the person still reviews and sends it.
    public static func present(type: ReportType? = nil, text: String? = nil) {
        if type != nil || text != nil { shared.draft = (type, String((text ?? "").prefix(2000))) }
        shared.present(.report)
    }

    /// Called after each report is sent, with its id and type (never its text), for example to
    /// thank people or count it in your analytics.
    public static func onSent(_ handler: @escaping @MainActor (SentEvent) -> Void) { shared.sentHandlers.append(handler) }

    func present(_ tab: SheetTab? = nil) {
        guard !isDisabled else { return }
        requestedTab = tab
        isPresented = true
    }

    /// Once per install: tell people Heresay is there and how to reach it. Call it where the app
    /// is settled, e.g. `.onAppear` of the main screen after sign-in or onboarding. Later calls do
    /// nothing, so it's safe on every launch. Returns whether it showed.
    /// `title` and `message` are optional, to use your own words.
    @discardableResult
    public static func introduce(title: String? = nil, message: String? = nil) -> Bool {
        shared.introduce(title: title, message: message)
    }

    func introduce(title: String? = nil, message: String? = nil) -> Bool {
        guard !isDisabled, !defaults.bool(forKey: Keys.introduced) else { return false }
        defaults.set(true, forKey: Keys.introduced)
        introWords = (title.map { String($0.trimmed.prefix(80)) }?.nilIfEmpty, message.map { String($0.trimmed.prefix(280)) }?.nilIfEmpty)
        introPending = true
        return true
    }

    var introTitle: String { introWords.title ?? words[.introTitle] }

    // MARK: Offering help

    /// The app saw trouble itself (an error screen, a retry that failed): offer to report it, with
    /// a small note by the button. Works without `nudge:` in `configure`; the same limits apply
    /// (once per launch, not for 7 days after "Not now"). Returns whether it showed.
    /// `stuck: true` for someone who seems unsure rather than blocked: "Stuck on something?", and the
    /// sheet opens as Confusing.
    @discardableResult
    public static func nudge(stuck: Bool = false) -> Bool { shared.offerHelp(stuck ? .stuck : .trouble) }

    @discardableResult
    func offerHelp(_ why: HelpOffer, now: Date = Date()) -> Bool {
        guard client != nil, buttonVisible, !isPresented, !introPending, offer == nil, !offeredThisLaunch else { return false }
        #if os(macOS)
        guard !IntroWindow.isOpen else { return false }
        #endif
        if let no = defaults.object(forKey: Keys.nudgeDeclined) as? Date, now.timeIntervalSince(no) < Self.nudgeRest { return false }
        offeredThisLaunch = true
        offer = why
        NudgeCard.announce(words[why == .crash ? .nudgeCrashTitle : why == .stuck ? .nudgeStuckTitle : .nudgeTitle])
        return true
    }

    static let nudgeRest: TimeInterval = 7 * 86_400

    /// "Tell the team" opens the sheet as Broken (Confusing when they seemed unsure), with the trail;
    /// "Not now" quiets it for 7 days.
    func answerOffer(_ yes: Bool, now: Date = Date()) {
        let was = offer
        offer = nil
        if yes {
            let type: ReportType = was == .stuck ? .confusing : .broken
            if draft.type == nil, style.types.contains(type) { draft.type = type }
            present(.report)
        } else {
            defaults.set(now, forKey: Keys.nudgeDeclined)
        }
    }

    /// Gone by itself, unanswered.
    func dropOffer() { offer = nil }

    /// MetricKit handed over a crash, now or on an earlier launch: offer once per crash.
    func crashArrived() {
        // MetricKit's crash, or a run that ended badly without one (a hang the system killed,
        // running out of memory): the same ending, offered once.
        guard nudges.contains(.crash), let at = Trail.lastCrash(defaults)?.at ?? blackBox?.lastRun()?.savedAt,
              (defaults.object(forKey: Keys.nudgedCrash) as? Date) != at else { return }
        if offerHelp(.crash) { defaults.set(at, forKey: Keys.nudgedCrash) }
    }

    // MARK: The black box

    /// Keep the trail on disk from now on, so a crash doesn't take it with it, and the app's own
    /// logged errors with it, read once a minute while the app is in front. The run before this
    /// one, if it ended badly, is kept for the next report.
    private func startBlackBox(_ parts: HeresayTrail) {
        logTimer?.invalidate(); logTimer = nil
        guard let box = blackBox else { return }
        trail.onChange = nil
        guard !parts.isEmpty else { return }
        box.begin(version: version, defaults: defaults)
        trail.onChange = { [box] entries in box.update(entries) }
        if parts.contains(.errors) { scheduleLogRead(after: Self.logEvery) }
    }

    /// A look at the log costs about a second and a half of one core, however little it reads (the
    /// system's log store, not Heresay), so: once a minute, only in front, at background priority,
    /// and every five minutes where a look takes longer than two seconds.
    private func scheduleLogRead(after: TimeInterval) {
        logTimer = Timer.scheduledTimer(withTimeInterval: after, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let box = self.blackBox else { return }
                guard Self.appInFront else { self.scheduleLogRead(after: Self.logEvery); return }
                Task { [weak self] in
                    let took = await box.readLog(every: Self.logEvery)
                    self?.scheduleLogRead(after: took > 2 ? Self.logEverySlow : Self.logEvery)
                }
            }
        }
    }

    nonisolated static let logEvery: TimeInterval = 60
    nonisolated static let logEverySlow: TimeInterval = 300

    static var appInFront: Bool {
        #if os(macOS)
        (NSApp as NSApplication?)?.isActive ?? false
        #else
        UIApplication.shared.applicationState == .active
        #endif
    }

    /// Where to find it, in this app, and who it's from.
    var introMessage: String { introBody + "\n\n" + words[.powered] }

    /// Where to find it, in this app.
    var introBody: String {
        let label = style.label.map { "“\($0)”" } ?? words[.report]
        let reach: String
        #if os(macOS)
        reach = Self.hasMenuCommand ? words[.reachMenu] : words(hasButton ? .reachClick : .reachUse, ["label": label])
        #else
        reach = words(hasButton ? .reachTap : .reachUse, ["label": label])
        #endif
        return introWords.message ?? words(.introBody, ["reach": reach])
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

    /// `trail` is what the reporter chose to attach in the sheet; from the app's own UI it is all
    /// of it, as on the web.
    func send(type: ReportType, text: String, trail chosen: [TrailEvent]?? = nil) async throws -> SentReport {
        guard let client else { throw Client.Failure(status: 0, message: "Heresay isn’t configured. Call Heresay.configure(key:url:) first.") }
        let events: [TrailEvent]?
        if let chosen { events = chosen } else { events = Trail.toSend(await gatherTrail()) }
        do {
            let r = try await client.submit(deviceId: deviceId, type: type, text: text, context: context(),
                                            reporter: prefs.reporter(signedIn: isSignedIn), trail: events)
            // A crash goes with one report, not every one after it.
            if events?.contains(where: { $0.detail?.hasPrefix(Trail.crashMark) == true }) == true { Trail.forgetCrash(defaults) }
            if events?.contains(where: { $0.run == "last" }) == true { blackBox?.forgetLastRun() }
            reports.insert(r, at: 0)
            for h in sentHandlers { h(SentEvent(id: r.id, type: r.type)) }
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
        for r in reports where r.status != .open { seen[r.id] = Self.mark(r) }
        defaults.set(seen, forKey: Keys.seen)
        recount()
    }

    private func recount() {
        let seen = seenStatuses
        unseen = reports.filter { $0.status != .open && seen[$0.id] != Self.mark($0) }.count
    }

    /// What the person has seen of a report: its status, and the version its fix ships in once known.
    nonisolated static func mark(_ r: SentReport) -> String { r.status.rawValue + (r.fixVersion.map { "@" + $0 } ?? "") }

    /// The app is on an older version than `v` ("1.3 (22)" < "1.4"). Unknown: false.
    func isOlder(than v: String) -> Bool { Self.older(version, v) }

    nonisolated static func older(_ a: String?, _ b: String?) -> Bool {
        let num = { (s: String?) -> [Int]? in
            guard let head = s?.split(whereSeparator: { " (+-".contains($0) }).first else { return nil }
            let parts = head.split(separator: ".").map { Int($0) }
            return parts.contains(nil) || parts.isEmpty ? nil : parts.map { $0! }
        }
        guard let x = num(a), let y = num(b) else { return false }
        for i in 0..<max(x.count, y.count) {
            let d = (i < x.count ? x[i] : 0) - (i < y.count ? y[i] : 0)
            if d != 0 { return d < 0 }
        }
        return false
    }

    private var seenStatuses: [String: String] {
        defaults.dictionary(forKey: Keys.seen) as? [String: String] ?? [:]
    }

    // MARK: Trail

    /// The trail as it stands: what was recorded, the app's log errors and the last crash. The log
    /// is read off the main thread, and only now, when someone is about to report.
    func gatherTrail(now: Date = Date()) async -> [Trail.Entry] {
        let parts = trail.parts
        guard !parts.isEmpty else { return [] }
        var more: [Trail.Entry] = []
        if parts.contains(.errors) {
            let since = now.addingTimeInterval(-Trail.maxAge)
            more += await Task.detached(priority: .userInitiated) { Trail.logErrors(since: since) }.value
            if let crash = Trail.lastCrash(defaults, now: now) { more.append(crash) }
        }
        more += blackBox?.lastRunEntries(now: now) ?? []
        return trail.recent(now: now, adding: more)
    }

    /// Heresay's own windows, whose clicks aren't the app's.
    func ownsWindow(_ w: AnyObject) -> Bool {
        #if os(macOS)
        return isPresented || IntroWindow.isOpen
        #else
        return isPresented
        #endif
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

    func context(now: Date = Date()) -> ReportContext {
        ReportContext(
            route: screen, appVersion: version, platform: Self.platform, os: Self.osDescription(),
            browser: nil, userId: userId, userLabel: userLabel, userEmail: userEmail, framework: "swiftui",
            viewport: Self.windowSize(),
            locale: Device.locale(), timezone: Device.timezone(), theme: Device.theme(), device: Device.model(),
            network: collectors.network, screen: Device.screen(),
            sessionS: max(0, Int(now.timeIntervalSince(started).rounded())), settings: Device.settings()
        )
    }

    /// When this launch began, near enough: Heresay is made when the app configures it.
    private let started = Date()

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
        static let introduced = "heresay.introduced"
        static let nudgeDeclined = "heresay.nudge.declined"
        static let nudgedCrash = "heresay.nudge.crash"
    }
}

/// A report was sent: which one, and what kind. Never its text.
public struct SentEvent: Sendable, Equatable {
    public let id: String
    public let type: ReportType
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

