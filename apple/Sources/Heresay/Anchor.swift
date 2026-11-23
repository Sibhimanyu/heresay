import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - Where the report opens from

/// What the open panel is attached to, when it is a popover.
enum AnchorTarget: Hashable, Sendable {
    /// The floating Report button.
    case floating
    /// A view marked with `.heresayAnchor()`.
    case view(UUID)
}

/// Which `.heresayAnchor()` views are on screen, and which one was used last. Pure logic, no UI.
/// A view is "used" when it is tapped; `Heresay.present()` then arrives in the same moment, so a
/// touch counts for `window` seconds and the most recent one wins.
struct AnchorBook: Sendable {
    static let window: TimeInterval = 1
    private(set) var live: Set<UUID> = []
    private var touched: [UUID: Date] = [:]

    var hasLive: Bool { !live.isEmpty }

    mutating func appear(_ id: UUID) { live.insert(id) }

    /// A view that left the screen can no longer be pointed at.
    mutating func disappear(_ id: UUID) { live.remove(id); touched[id] = nil }

    mutating func touch(_ id: UUID, at now: Date = Date()) { if live.contains(id) { touched[id] = now } }

    /// The anchor tapped most recently and still on screen, if that was within the window.
    func pick(at now: Date = Date()) -> UUID? {
        touched.filter { live.contains($0.key) && now.timeIntervalSince($0.value) <= Self.window && now >= $0.value }
            .max { $0.value < $1.value }?.key
    }

    /// Use up the touches so a later `present()` from code doesn't point at an old tap.
    mutating func consume() { touched.removeAll() }
}

/// What someone typed and chose, kept when the panel is closed without sending (tap outside, swipe
/// down, Escape) so reopening finds it again. Cleared when a report is sent.
struct KeptDraft: Equatable, Sendable {
    var type: ReportType?
    var text: String

    var isEmpty: Bool { type == nil && text.trimmed.isEmpty }

    /// What to start with: what the app asked for (`present(type:text:)`) wins, then what was kept.
    static func start(asked: (type: ReportType?, text: String), kept: KeptDraft?) -> KeptDraft {
        if asked.type != nil || !asked.text.isEmpty { return KeptDraft(type: asked.type, text: asked.text) }
        return kept ?? KeptDraft(type: nil, text: "")
    }
}

extension Heresay {
    /// For the Example app's launch-time demos: act as if every anchor on screen was just tapped.
    @_spi(Demo) public static func tapAnchorsForDemo() {
        for id in shared.anchors.live { shared.anchors.touch(id) }
    }

    /// Popovers need room: iPad and Mac. iPhone always gets the sheet.
    static var popoversAvailable: Bool {
        #if os(macOS)
        true
        #else
        UIDevice.current.userInterfaceIdiom == .pad
        #endif
    }

    func keep(type: ReportType?, text: String) {
        let d = KeptDraft(type: type, text: text)
        kept = d.isEmpty ? nil : d
    }
}

// MARK: - The modifier

public extension View {
    /// Marks the app's own "Report a problem" button (or toolbar item, or sidebar row) as the place
    /// the report opens from. On iPad and Mac, `Heresay.present()` called from that button shows
    /// the report as a popover pointing at it; on iPhone, and anywhere without an anchor, it is a
    /// sheet. Use it with `.heresay()` (no floating button).
    func heresayAnchor() -> some View { modifier(HeresayAnchorModifier()) }
}

struct HeresayAnchorModifier: ViewModifier {
    @ObservedObject var heresay = Heresay.shared
    @State private var id = UUID()
    /// Whether the view is in the top half of the screen, to open the popover on the side with room.
    @State private var below = true

    private static var screenMid: CGFloat {
        #if os(iOS)
        UIScreen.main.bounds.midY
        #else
        (NSApp.keyWindow?.contentView?.bounds.height ?? 800) / 2
        #endif
    }

    private var shown: Binding<Bool> {
        Binding(get: { Heresay.popoversAvailable && heresay.popoverIsOn(.view(id)) },
                set: { if !$0 { heresay.isPresented = false } })
    }

    func body(content: Content) -> some View {
        content
            .onAppear { heresay.anchors.appear(id) }
            .onDisappear { heresay.anchors.disappear(id) }
            .simultaneousGesture(TapGesture().onEnded { heresay.touchAnchor(id) })
            .background(GeometryReader { g in
                Color.clear
                    .onAppear { below = g.frame(in: .global).midY < Self.screenMid }
                    .onChange(of: g.frame(in: .global).midY) { y in below = y < Self.screenMid }
            })
            .heresayPopover(shown, heresay: heresay, edge: below ? .top : .bottom)
    }
}

extension View {
    /// The report panel as a popover on this view. Transient: a click or tap outside closes it.
    func heresayPopover(_ shown: Binding<Bool>, heresay: Heresay, edge: Edge = .top) -> some View {
        popover(isPresented: shown, attachmentAnchor: .rect(.bounds), arrowEdge: edge) {
            ReportSheet(heresay: heresay, inPopover: true)
                .heresayTypeface(heresay.style.typeface)
                .preferredColorScheme(heresay.style.colorScheme)
                .modifier(CompactAsSheet())
        }
    }
}

/// In a narrow iPad window (Split View) a popover becomes a sheet, which is what we want.
struct CompactAsSheet: ViewModifier {
    func body(content: Content) -> some View {
        #if os(iOS)
        if #available(iOS 16.4, *) { content.presentationCompactAdaptation(.sheet) } else { content }
        #else
        content
        #endif
    }
}
