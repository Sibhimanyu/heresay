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

    public static let all: HeresayNudge = [.clicks, .crash]
}

/// Why the note is up. The words differ; "Tell the team" does the same.
enum HelpOffer: Equatable, Sendable { case trouble, crash }

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
            Text(w[offer == .crash ? .nudgeCrashTitle : .nudgeTitle])
                .font(.headline)
            Text(w[offer == .crash ? .nudgeCrashBody : .nudgeBody])
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
