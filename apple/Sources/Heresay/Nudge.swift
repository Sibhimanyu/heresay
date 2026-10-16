import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// When someone seems stuck, a small note by the button asks whether they want to tell the team.
/// Pass to `Heresay.configure(…, nudge:)`. Off unless the app turns it on: it is the app's screen it
/// appears on. Watched on the device and never sent anywhere; it only offers the sheet, with the
/// trail. At most once per launch, and not for 7 days after "Not now".
public struct HeresayNudge: OptionSet, Sendable, Hashable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    /// macOS: a disabled control clicked 3 times in 10 seconds, or the same spot clicked 5 times in
    /// 2 seconds. Text, sliders, steppers and scrolling don't count. Leave it out for games and
    /// drawing apps, where clicking fast in one place is the point. iOS has no taps to watch;
    /// recording them there would mean swizzling.
    public static let clicks = HeresayNudge(rawValue: 1 << 0)
    /// The app crashed last time: offered once, at the next launch, while the crash is still in
    /// the trail (a day).
    public static let crash = HeresayNudge(rawValue: 1 << 1)
    /// Going in circles: 6 screen changes in a minute among at most 3 screens, one of them seen 3
    /// times. Needs screens named with `Heresay.setScreen` or `.heresayScreen(_:)`.
    public static let circles = HeresayNudge(rawValue: 1 << 2)
    /// Typing that stopped: someone typed in a field, then 45 seconds passed with the field still
    /// being edited (the keyboard still up on iOS), the app in front and the same screen. Search
    /// fields don't count.
    public static let stalled = HeresayNudge(rawValue: 1 << 3)

    public static let all: HeresayNudge = [.clicks, .crash, .circles, .stalled]
}

/// Why the note is up. Something failed ("Something not working?", opens as Broken), the app
/// crashed, or someone seems unsure ("Stuck on something?", opens as Confusing).
enum HelpOffer: Equatable, Sendable { case trouble, crash, stuck }

/// Going in circles between a few screens. Pure, so the rule is tested without an app.
struct CircleWatch {
    private var visits: [(at: Date, screen: String)] = []

    /// A screen shown. True when the last minute is 6 or more visits among at most 3 screens,
    /// one of them seen 3 times; then it starts over.
    mutating func visit(_ screen: String, at: Date) -> Bool {
        visits = visits.filter { at.timeIntervalSince($0.at) < 60 } + [(at, screen)]
        guard visits.count >= 6 else { return false }
        let count = Dictionary(visits.map { ($0.screen, 1) }, uniquingKeysWith: +)
        guard count.count <= 3, count.values.contains(where: { $0 >= 3 }) else { return false }
        visits = []
        return true
    }

    mutating func reset() { visits = [] }
}

/// Typing that stopped. Pure: the watcher says when someone typed and what is still true.
struct StallWatch {
    static let wait: TimeInterval = 45
    private(set) var typedAt: Date?
    private var screen: String?

    mutating func typed(at: Date, screen: String?) { typedAt = at; self.screen = screen }
    mutating func done() { typedAt = nil }

    /// True once, when 45 s have passed since the last keystroke and they are still on it.
    mutating func check(now: Date, stillEditing: Bool, active: Bool, screen: String?) -> Bool {
        guard let t = typedAt else { return false }
        if !stillEditing || screen != self.screen { typedAt = nil; return false }
        guard active, now.timeIntervalSince(t) >= Self.wait else { return false }
        typedAt = nil
        return true
    }
}

/// Watches typing for `.stalled`, from the text system's own notifications. Never reads what was
/// typed: only that something was, and whether the field is still being edited.
@MainActor
final class StallWatcher {
    private var watch = StallWatch()
    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    #if os(iOS)
    private var keyboardUp = false
    #endif

    func start(_ heresay: Heresay) {
        stop()
        let nc = NotificationCenter.default
        let typed: @Sendable (Notification) -> Void = { [weak self, weak heresay] n in
            nonisolated(unsafe) let object = n.object
            MainActor.assumeIsolated {
                guard let self, let heresay, !heresay.isPresented, !Self.isSearch(object) else { return }
                self.watch.typed(at: Date(), screen: heresay.screen)
                if self.timer == nil {
                    self.timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self, weak heresay] _ in
                        MainActor.assumeIsolated { if let self, let heresay { self.tick(heresay) } }
                    }
                }
            }
        }
        #if os(macOS)
        observers.append(nc.addObserver(forName: NSControl.textDidChangeNotification, object: nil, queue: .main, using: typed))
        observers.append(nc.addObserver(forName: NSText.didChangeNotification, object: nil, queue: .main, using: typed))
        observers.append(nc.addObserver(forName: NSControl.textDidEndEditingNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.watch.done() }
        })
        #else
        observers.append(nc.addObserver(forName: UITextField.textDidChangeNotification, object: nil, queue: .main, using: typed))
        observers.append(nc.addObserver(forName: UITextView.textDidChangeNotification, object: nil, queue: .main, using: typed))
        observers.append(nc.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.keyboardUp = true }
        })
        observers.append(nc.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.keyboardUp = false; self?.watch.done() }
        })
        #endif
    }

    func stop() {
        for o in observers { NotificationCenter.default.removeObserver(o) }
        observers = []
        timer?.invalidate(); timer = nil
        watch = StallWatch()
    }

    private func tick(_ heresay: Heresay) {
        #if os(macOS)
        let editing = (NSApp as NSApplication?)?.keyWindow?.firstResponder is NSText
        let active = (NSApp as NSApplication?)?.isActive ?? false
        #else
        let editing = keyboardUp
        let active = UIApplication.shared.applicationState == .active
        #endif
        if heresay.isPresented { watch.done() }
        if watch.check(now: Date(), stillEditing: editing, active: active, screen: heresay.screen) {
            heresay.offerHelp(.stuck)
        }
        if watch.typedAt == nil { timer?.invalidate(); timer = nil }
    }

    /// Search fields: typing, then reading the results, is not being stuck.
    static func isSearch(_ object: Any?) -> Bool {
        #if os(macOS)
        return object is NSSearchField
        #else
        return object is UISearchTextField
        #endif
    }
}

/// Clicks that look like someone stuck. Pure, so the rules are tested without a window.
struct ClickWatch {
    enum Kind: Equatable {
        /// Clicking fast here is normal: text (selecting a word, a line), sliders, steppers, scrolling.
        case ignored
        /// A control that can't be used right now, by identity.
        case disabled(Int)
        case other
    }

    static let disabledCount = 3, disabledSpan: TimeInterval = 10
    static let rapidCount = 5, rapidSpan: TimeInterval = 2, rapidDistance: CGFloat = 8

    private var recent: [(at: Date, point: CGPoint, window: Int, kind: Kind)] = []

    /// One mouse down. True when it looks like someone is stuck; then it starts counting again.
    mutating func press(at: Date, point: CGPoint, window: Int, kind: Kind) -> Bool {
        guard kind != .ignored else { return false }
        recent = recent.filter { at.timeIntervalSince($0.at) < Self.disabledSpan } + [(at, point, window, kind)]
        if case .disabled = kind, recent.filter({ $0.kind == kind }).count >= Self.disabledCount {
            recent = []
            return true
        }
        let near = recent.filter {
            at.timeIntervalSince($0.at) < Self.rapidSpan && $0.window == window
                && hypot($0.point.x - point.x, $0.point.y - point.y) <= Self.rapidDistance
        }
        if near.count >= Self.rapidCount {
            recent = []
            return true
        }
        return false
    }
}

#if os(macOS)
/// The mouse downs `ClickWatch` judges, from a local event monitor. Public API only.
@MainActor
final class NudgeWatcher {
    private var monitor: Any?
    private var watch = ClickWatch()

    func start(_ heresay: Heresay) {
        stop()
        monitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self, weak heresay] event in
            guard let self, let heresay, let window = event.window, !heresay.ownsWindow(window) else { return event }
            let kind = Self.kind(event, in: window)
            if self.watch.press(at: Date(), point: event.locationInWindow, window: window.windowNumber, kind: kind) {
                heresay.offerHelp(.trouble)
            }
            return event
        }
    }

    func stop() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        watch = ClickWatch()
    }

    /// What is under the mouse, from AppKit's own hit test, up to the nearest control.
    static func kind(_ event: NSEvent, in window: NSWindow) -> ClickWatch.Kind {
        guard let frame = window.contentView?.superview else { return .other }
        var view = frame.hitTest(frame.convert(event.locationInWindow, from: nil))
        while let v = view {
            if v is NSText || v is NSTextField || v is NSSlider || v is NSStepper || v is NSScroller { return .ignored }
            if let c = v as? NSControl { return c.isEnabled ? .other : .disabled(ObjectIdentifier(c).hashValue) }
            view = v.superview
        }
        return .other
    }
}
#endif

/// The note itself: by the button (or in its corner), no focus taken, gone by itself after 15
/// seconds unless the pointer is on it or VoiceOver is reading.
struct NudgeCard: View {
    @ObservedObject var heresay: Heresay
    let offer: HelpOffer
    @State private var hovering = false

    private var w: Words { heresay.words }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(w[offer == .crash ? .nudgeCrashTitle : offer == .stuck ? .nudgeStuckTitle : .nudgeTitle])
                .font(.headline)
            Text(w[offer == .crash ? .nudgeCrashBody : offer == .stuck ? .nudgeStuckBody : .nudgeBody])
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                Spacer()
                Button(w[.nudgeNo]) { heresay.answerOffer(false) }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
                Button(w[.nudgeYes]) { heresay.answerOffer(true) }
                    .buttonStyle(.borderedProminent)
                    .tint(heresay.accent)
            }
            .padding(.top, 6)
            Divider().padding(.top, 4)
            PoweredBy(heresay: heresay)
                .padding(.vertical, -4)
        }
        .padding(14)
        .frame(width: 300, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.primary.opacity(0.12)))
        .shadow(color: .black.opacity(0.18), radius: 14, y: 6)
        .heresayTypeface(heresay.style.typeface)
        .heresayScheme(heresay.style.colorScheme)
        .accessibilityElement(children: .contain)
        .onHover { hovering = $0 }
        .task(id: hovering) {
            guard !hovering, !Self.screenReaderRunning else { return }
            try? await Task.sleep(for: .seconds(15))
            if !Task.isCancelled { heresay.dropOffer() }
        }
    }

    static var screenReaderRunning: Bool {
        #if os(macOS)
        NSWorkspace.shared.isVoiceOverEnabled
        #else
        UIAccessibility.isVoiceOverRunning
        #endif
    }

    /// Say it out loud too: the note takes no focus, so VoiceOver would not land on it.
    @MainActor static func announce(_ text: String) {
        #if os(macOS)
        guard let app = NSApp as NSApplication?, let window = app.mainWindow ?? app.keyWindow else { return }
        NSAccessibility.post(element: window, notification: .announcementRequested,
                             userInfo: [.announcement: text, .priority: NSAccessibilityPriorityLevel.medium.rawValue])
        #else
        UIAccessibility.post(notification: .announcement, argument: text)
        #endif
    }
}
