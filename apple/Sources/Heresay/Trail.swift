import Foundation
import Network
import OSLog
import SwiftUI
#if canImport(MetricKit)
import MetricKit
#endif
#if os(macOS)
import AppKit
#endif

/// The parts of the trail an app keeps: what happened in it before a report, sent only with a
/// report and only if the reporter leaves "Attach what happened" on. Pass to
/// `Heresay.configure(…, trail:)`. Everything is on by default; `[]` turns the trail off.
public struct HeresayTrail: OptionSet, Sendable, Hashable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    /// Screens named with `Heresay.setScreen` or `.heresayScreen(_:)`.
    public static let screens = HeresayTrail(rawValue: 1 << 0)
    /// macOS: what was clicked, by its accessibility label, and menu commands (including their
    /// keyboard shortcuts). Never what was typed. iOS has none; recording taps there would mean
    /// swizzling.
    public static let clicks = HeresayTrail(rawValue: 1 << 1)
    /// The app's own `Logger` errors and faults, and how the last run crashed (MetricKit).
    public static let errors = HeresayTrail(rawValue: 1 << 2)

    public static let all: HeresayTrail = [.screens, .clicks, .errors]
}

/// One kind of thing in the trail. The same kinds as the web SDK and the server (`core/trail.ts`).
enum TrailKind: String, Codable, CaseIterable, Sendable {
    case page, click, request, error, warn, state
}

/// What goes with a report: seconds before it was sent, one line, and for errors the top of the
/// stack. The same fields as the web SDK sends.
struct TrailEvent: Codable, Sendable, Equatable {
    var kind: TrailKind
    var ago: Int
    var text: String
    var detail: String?
    var n: Int
}

/// The trail on this device: in memory only (the newest 30, for 5 minutes), plus the app's log
/// read when someone reports. Leaves only with a report.
final class Trail: @unchecked Sendable {
    struct Entry: Equatable, Sendable, Identifiable {
        var kind: TrailKind
        var at: Date
        var text: String
        var detail: String?
        var n = 1
        var id: String { "\(kind.rawValue)\(at.timeIntervalSinceReferenceDate)\(text)" }
    }

    static let maxEvents = 30
    static let maxAge: TimeInterval = 5 * 60

    private let lock = NSLock()
    private var entries: [Entry] = []
    private(set) var parts: HeresayTrail = []

    func setParts(_ p: HeresayTrail) { lock.withLock { parts = p } }

    /// Keep one thing. The same thing again right after only counts it ("×3").
    func note(_ kind: TrailKind, _ text: String?, detail: String? = nil, at: Date = Date()) {
        guard let text = text.flatMap({ Self.scrub($0, max: 200) }) else { return }
        lock.withLock {
            guard Self.part(kind).map(parts.contains) ?? !parts.isEmpty else { return }
            if let last = entries.last, last.kind == kind, last.text == text {
                entries[entries.count - 1].n += 1
                entries[entries.count - 1].at = at
                return
            }
            entries.append(Entry(kind: kind, at: at, text: text, detail: detail.flatMap { Self.scrub($0, max: 600) }))
            if entries.count > Self.maxEvents { entries.removeFirst(entries.count - Self.maxEvents) }
        }
    }

    /// The part that turns a kind on. Connection changes come with any part.
    private static func part(_ k: TrailKind) -> HeresayTrail? {
        switch k {
        case .page: .screens
        case .click: .clicks
        case .error, .warn, .request: .errors
        case .state: nil
        }
    }

    /// What happened in the last five minutes, with `more` (the log, the last crash) merged in,
    /// oldest first.
    func recent(now: Date = Date(), adding more: [Entry] = []) -> [Entry] {
        let cut = now.addingTimeInterval(-Self.maxAge)
        let mine = lock.withLock { entries.filter { $0.at >= cut } }
        let all = (mine + more.filter { $0.at >= cut || $0.kind == .error && $0.detail?.hasPrefix(Self.crashMark) == true })
            .sorted { $0.at < $1.at }
        return Array(all.suffix(Self.maxEvents))
    }

    /// The kinds the reporter kept, as the server takes them; nil when there is nothing to send.
    static func toSend(_ entries: [Entry], skip: Set<TrailKind> = [], now: Date = Date()) -> [TrailEvent]? {
        let out = entries.filter { !skip.contains($0.kind) }.map {
            TrailEvent(kind: $0.kind, ago: min(3600, max(0, Int(now.timeIntervalSince($0.at).rounded()))),
                       text: $0.text, detail: $0.detail, n: $0.n)
        }
        return out.isEmpty ? nil : out
    }

    /// Blanks what tends to be personal or secret before it is kept: emails, bearer tokens, JWTs,
    /// long opaque strings, long numbers, query strings and file paths under the home folder.
    /// The server (`core/trail.ts`) does the same again.
    static func scrub(_ s: String, max: Int) -> String? {
        var v = s.unicodeScalars.filter { !($0.value < 0x20 && $0 != "\n" && $0 != "\t") && $0.value != 0x7f }
            .reduce(into: "") { $0.unicodeScalars.append($1) }
            .trimmed
        let home = NSHomeDirectory()
        if home.count > 1 { v = v.replacingOccurrences(of: home, with: "~") }
        let rules: [(String, String)] = [
            (#"(https?://[^\s?#"'`)]*)\?[^\s#"'`)]*"#, "$1"),
            (#"(^|\s)(/[^\s?#]*)\?[^\s#)]*"#, "$1$2"),
            (#"/Users/[^/\s]+"#, "~"),
            (#"[^\s@"'<>()]+@[^\s@"'<>()]+\.[A-Za-z]{2,}"#, "[email]"),
            (#"(?i)\bBearer\s+\S+"#, "Bearer [token]"),
            (#"\beyJ[\w-]+\.[\w-]+\.[\w-]*"#, "[token]"),
            (#"\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b"#, "[token]"),
        ]
        for (p, r) in rules { v = v.replacingOccurrences(of: p, with: r, options: .regularExpression) }
        // Seven or more digits in a run (spaces and dashes allowed): a phone or card number.
        if let re = try? NSRegularExpression(pattern: #"\d[\d -]{6,}\d"#) {
            for m in re.matches(in: v, range: NSRange(v.startIndex..., in: v)).reversed() {
                guard let r = Range(m.range, in: v), v[r].filter(\.isNumber).count >= 7 else { continue }
                v.replaceSubrange(r, with: "[number]")
            }
        }
        return v.isEmpty ? nil : String(v.prefix(max))
    }

    // MARK: The app's log

    /// The app's own errors and faults from its log, the last five minutes. Read only when someone
    /// reports, never in the background. Apple's frameworks are left out: they are noise to the team.
    /// Nothing when the log can't be read (some managed Macs don't allow it).
    static func logErrors(since: Date) -> [Entry] {
        guard let store = try? OSLogStore(scope: .currentProcessIdentifier),
              let all = try? store.getEntries(at: store.position(date: since),
                                              matching: NSPredicate(format: "messageType >= 16"))
        else { return [] }
        var out: [Entry] = []
        for case let e as OSLogEntryLog in all where e.level == .error || e.level == .fault {
            let sub = e.subsystem
            if sub.hasPrefix("com.apple.") || e.date < since { continue }
            let line = (e.category.isEmpty ? "" : e.category + ": ") + e.composedMessage
            guard let text = scrub(line, max: 200) else { continue }
            // The same line again right after only counts it, as in the trail.
            if let last = out.last, last.text == text { out[out.count - 1].n += 1; out[out.count - 1].at = e.date; continue }
            out.append(Entry(kind: .error, at: e.date, text: text, detail: sub.isEmpty ? nil : sub))
        }
        return Array(out.suffix(maxEvents))
    }

    // MARK: The last crash

    /// The `detail` of a crash starts with this, so it stays in the trail past five minutes.
    static let crashMark = "Last run"

    /// How the last run crashed, kept until a report carries it or a day has passed.
    static func lastCrash(_ defaults: UserDefaults, now: Date = Date()) -> Entry? {
        guard let d = defaults.dictionary(forKey: crashKey), let at = d["at"] as? Date, let text = d["text"] as? String,
              now.timeIntervalSince(at) < 86_400 else { return nil }
        return Entry(kind: .error, at: at, text: text, detail: d["detail"] as? String)
    }

    static func keepCrash(_ defaults: UserDefaults, at: Date, text: String, frames: [String]) {
        guard let text = scrub(text, max: 200) else { return }
        let detail = scrub(([crashMark] + frames.prefix(5)).joined(separator: "\n"), max: 600)
        defaults.set(["at": at, "text": text, "detail": detail as Any], forKey: crashKey)
    }

    static func forgetCrash(_ defaults: UserDefaults) { defaults.removeObject(forKey: crashKey) }

    static let crashKey = "heresay.last_crash"

    /// "binary +offset" for the crashed thread's top frames, from MetricKit's call stack JSON.
    static func frames(fromCallStackJSON data: Data) -> [String] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let stacks = root["callStacks"] as? [[String: Any]] else { return [] }
        let stack = stacks.first { $0["threadAttributed"] as? Bool == true } ?? stacks.first
        var out: [String] = []
        var frame = (stack?["callStackRootFrames"] as? [[String: Any]])?.first
        while let f = frame, out.count < 5 {
            let name = f["binaryName"] as? String ?? "?"
            let off = (f["offsetIntoBinaryTextSegment"] as? NSNumber).map { " +\($0)" } ?? ""
            out.append(name + off)
            frame = (f["subFrames"] as? [[String: Any]])?.first
        }
        return out
    }
}

// MARK: - Collectors

/// What the app records. All of it is in-process, with public APIs only: no swizzling.
@MainActor
final class TrailCollectors {
    private let trail: Trail
    private let defaults: UserDefaults
    private var path: NWPathMonitor?
    private var online: Bool?
    #if os(macOS)
    private var clickMonitor: Any?
    private var menuObserver: NSObjectProtocol?
    #endif
    #if canImport(MetricKit) && !os(tvOS)
    private var crashes: AnyObject?
    #endif

    init(trail: Trail, defaults: UserDefaults) {
        self.trail = trail
        self.defaults = defaults
    }

    /// `crashed` is called when MetricKit hands over a crash, for `HeresayNudge.crash`.
    func start(_ parts: HeresayTrail, crashed: (@Sendable () -> Void)? = nil) {
        stop()
        trail.setParts(parts)
        guard !parts.isEmpty else { return }
        watchConnection()
        #if os(macOS)
        if parts.contains(.clicks) { watchClicks() }
        #endif
        #if canImport(MetricKit) && !os(tvOS)
        if parts.contains(.errors) {
            let s = CrashSubscriber(defaults: defaults, crashed: crashed)
            MXMetricManager.shared.add(s)
            crashes = s
        }
        #endif
    }

    func stop() {
        path?.cancel(); path = nil; online = nil
        #if os(macOS)
        if let clickMonitor { NSEvent.removeMonitor(clickMonitor) }
        if let menuObserver { NotificationCenter.default.removeObserver(menuObserver) }
        clickMonitor = nil; menuObserver = nil
        #endif
        #if canImport(MetricKit) && !os(tvOS)
        if let s = crashes as? CrashSubscriber { MXMetricManager.shared.remove(s) }
        crashes = nil
        #endif
    }

    /// Going offline and back, not the first look.
    private func watchConnection() {
        let m = NWPathMonitor()
        m.pathUpdateHandler = { [weak self, trail] p in
            let up = p.status == .satisfied
            Task { @MainActor in
                guard let self else { return }
                if let was = self.online, was != up { trail.note(.state, up ? "Back online" : "Went offline") }
                self.online = up
            }
        }
        m.start(queue: DispatchQueue(label: "dev.heresay.path"))
        path = m
    }

    #if os(macOS)
    private func watchClicks() {
        // Mouse down: a control's tracking loop takes the mouse up before any monitor sees it.
        clickMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [trail] event in
            if let what = Clicks.describe(event) { trail.note(.click, what) }
            return event
        }
        menuObserver = NotificationCenter.default.addObserver(forName: NSMenu.didSendActionNotification, object: nil, queue: .main) { [trail] n in
            // Posted on the main thread, with the queue above.
            nonisolated(unsafe) let item = n.userInfo?["MenuItem"] as? NSMenuItem
            MainActor.assumeIsolated {
                guard let item, let what = Clicks.menuPath(item) else { return }
                trail.note(.click, what)
            }
        }
    }
    #endif
}

#if canImport(MetricKit) && !os(tvOS)
/// MetricKit hands over how the last run crashed, at the next launch. Kept for the next report.
final class CrashSubscriber: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    private let defaults: UserDefaults
    private let crashed: (@Sendable () -> Void)?
    init(defaults: UserDefaults, crashed: (@Sendable () -> Void)? = nil) { self.defaults = defaults; self.crashed = crashed }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        var any = false
        for p in payloads {
            guard let c = p.crashDiagnostics?.last else { continue }
            Trail.keepCrash(defaults, at: p.timeStampEnd, text: Self.describe(c), frames: Trail.frames(fromCallStackJSON: c.callStackTree.jsonRepresentation()))
            any = true
        }
        if any { crashed?() }
    }

    static func describe(_ c: MXCrashDiagnostic) -> String {
        var parts = ["The app crashed"]
        if let t = c.exceptionType?.intValue { parts.append(Self.exception[t] ?? "exception \(t)") }
        if let s = c.signal?.intValue { parts.append(Self.signal[s] ?? "signal \(s)") }
        var line = parts.joined(separator: ": ")
        if #available(iOS 17.0, macOS 14.0, *), let r = c.exceptionReason {
            line += " (\(r.exceptionName): \(r.composedMessage))"
        } else if let r = c.terminationReason, !r.isEmpty {
            line += " (\(r))"
        }
        if !c.applicationVersion.isEmpty { line += ", version \(c.applicationVersion)" }
        return line
    }

    static let exception: [Int: String] = [1: "EXC_BAD_ACCESS", 2: "EXC_BAD_INSTRUCTION", 3: "EXC_ARITHMETIC", 5: "EXC_SOFTWARE",
                                           6: "EXC_BREAKPOINT", 10: "EXC_CRASH", 11: "EXC_RESOURCE", 12: "EXC_GUARD"]
    static let signal: [Int: String] = [4: "SIGILL", 5: "SIGTRAP", 6: "SIGABRT", 8: "SIGFPE", 9: "SIGKILL", 10: "SIGBUS", 11: "SIGSEGV", 13: "SIGPIPE"]
}
#endif

#if os(macOS)
/// A click as one line: the control's kind and its label, from the same accessibility tree
/// VoiceOver reads. Never a field's value, never the text of what isn't a control.
@MainActor
enum Clicks {
    static func describe(_ event: NSEvent) -> String? {
        guard let window = event.window, !Heresay.shared.ownsWindow(window) else { return nil }
        let inWindow = event.locationInWindow
        let isPrivate = PrivateMarker.covers(inWindow, in: window)
        let screen = window.convertPoint(toScreen: inWindow)
        if let hit = window.accessibilityHitTest(screen), let what = describe(element: hit as AnyObject, isPrivate: isPrivate) {
            return what
        }
        // SwiftUI builds accessibility for what it draws itself only while an assistive app is
        // running. Without one, AppKit's own hit test still finds the controls AppKit draws for
        // SwiftUI (buttons, toggles, pickers, fields) and the toolbar item, which has a label.
        guard let frame = window.contentView?.superview, let view = frame.hitTest(frame.convert(inWindow, from: nil)) else { return nil }
        if let item = window.toolbar?.items.first(where: { $0.view.map(view.isDescendant(of:)) ?? false }) {
            let name = isPrivate ? "" : String((item.label.nilIfEmpty ?? item.paletteLabel).prefix(40))
            return name.isEmpty ? "toolbar item" : "toolbar item \"\(name)\""
        }
        return describe(element: view, isPrivate: isPrivate)
    }

    private static let roles: [NSAccessibility.Role: String] = [
        .button: "button", .checkBox: "checkbox", .radioButton: "radio", .popUpButton: "pop-up",
        .menuButton: "menu", .link: "link", .textField: "field", .textArea: "field", .comboBox: "field",
        .slider: "slider", .incrementor: "stepper", .disclosureTriangle: "disclosure", .tabGroup: "tab",
        .colorWell: "colour well", .row: "row", .cell: "row", .image: "image",
    ]
    /// Their text is the person's own content (a note's title, a message), so only the kind is kept.
    private static let contentRoles: Set<String> = ["row", "image"]

    static func describe(element: AnyObject, isPrivate: Bool) -> String? {
        var el = element as? NSObject
        for _ in 0..<8 {
            guard let e = el else { return nil }
            if let role = ax(e, "Role").map(NSAccessibility.Role.init(rawValue:)), let what = roles[role] {
                let secure = ax(e, "Subrole") == NSAccessibility.Subrole.secureTextField.rawValue
                guard !isPrivate, !secure, !contentRoles.contains(what) else { return what }
                // A field by its label or placeholder; anything else by its label, title or help.
                let keys = what == "field" ? ["Label", "PlaceholderValue"] : ["Label", "Title", "Help"]
                var name = keys.lazy.compactMap { ax(e, $0) }.first { !$0.trimmed.isEmpty } ?? ""
                name = name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
                if name.count > 40 { name = String(name.prefix(39)) + "…" }
                return name.isEmpty ? what : "\(what) \"\(name)\""
            }
            el = attribute(e, "Parent") as? NSObject
        }
        return nil
    }

    /// An accessibility attribute as text, if the element has it.
    private static func ax(_ e: NSObject, _ name: String) -> String? { attribute(e, name) as? String }

    /// `accessibilityLabel` and the like, or the older `AXDescription` form, which is all some of
    /// AppKit's own elements (a table cell) answer.
    private static func attribute(_ e: NSObject, _ name: String) -> Any? {
        let getter = NSSelectorFromString("accessibility" + name)
        if e.responds(to: getter), let v = e.value(forKey: "accessibility" + name) {
            if let s = v as? String, s.isEmpty {} else { return v }
        }
        let old = NSSelectorFromString("accessibilityAttributeValue:")
        guard e.responds(to: old) else { return nil }
        let attr = name == "Label" ? "AXDescription" : "AX" + name
        return e.perform(old, with: attr)?.takeUnretainedValue()
    }

    /// `menu "File › Export…"`, for a click or its keyboard shortcut. Heresay's own item is left out.
    static func menuPath(_ item: NSMenuItem) -> String? {
        guard item.title != Heresay.shared.words[.menuItem] else { return nil }
        var names = [item.title]
        var parent = item.parent
        while let p = parent { names.insert(p.title, at: 0); parent = p.parent }
        let path = names.filter { !$0.isEmpty }.joined(separator: " › ")
        return path.isEmpty ? nil : "menu \"\(path)\""
    }
}

/// `.heresayPrivate()` puts one of these behind a view: a click inside it records only what kind
/// of control it was, never its label.
final class PrivateMarker: NSView {
    private static let all = NSHashTable<PrivateMarker>.weakObjects()

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window != nil { Self.all.add(self) } else { Self.all.remove(self) }
    }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func isAccessibilityElement() -> Bool { false }

    static func covers(_ point: NSPoint, in window: NSWindow) -> Bool {
        all.allObjects.contains { $0.window === window && $0.convert($0.bounds, to: nil).contains(point) }
    }
}

struct PrivateMarkerView: NSViewRepresentable {
    func makeNSView(context: Context) -> PrivateMarker { PrivateMarker() }
    func updateNSView(_ v: PrivateMarker, context: Context) {}
}
#endif

public extension View {
    /// Names the screen while it is shown, for reports and the trail. The same as calling
    /// `Heresay.setScreen(name)` in `onAppear`.
    func heresayScreen(_ name: String) -> some View {
        onAppear { Heresay.setScreen(name) }
    }

    /// Clicks inside this view are recorded without their labels: `button` instead of
    /// `button "Delete Priya's account"`. For controls whose names are someone's data.
    func heresayPrivate() -> some View {
        #if os(macOS)
        background(PrivateMarkerView())
        #else
        self
        #endif
    }
}
