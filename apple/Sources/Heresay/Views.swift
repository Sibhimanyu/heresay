import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - Entry points

public extension View {
    /// A Report button in the corner, and the sheet it opens. The usual choice on iOS. The corner
    /// comes from `HeresayStyle.position`; `alignment` overrides it.
    func heresayReportButton(alignment: Alignment? = nil) -> some View {
        modifier(ReportButtonModifier(alignment: alignment, showsButton: true))
    }

    /// Only the sheet, for apps that open it from their own button, menu or shortcut
    /// (`Heresay.present()` or `HeresayCommands` on macOS).
    func heresay() -> some View {
        modifier(ReportButtonModifier(alignment: nil, showsButton: false))
    }
}

#if os(macOS)
/// Help › Report a Problem… (⌥⌘R). Add with `.commands { HeresayCommands() }`, and put
/// `.heresay()` on the window's root view so the sheet has somewhere to open.
public struct HeresayCommands: Commands {
    public init() { Heresay.hasMenuCommand = true }
    public var body: some Commands {
        CommandGroup(after: .help) {
            Button(Heresay.shared.words[.menuItem]) { Heresay.present() }
                .keyboardShortcut("r", modifiers: [.command, .option])
        }
    }
}
#endif

/// Heresay's site, from every sheet and the introduction.
let heresayURL = URL(string: "https://sibhimanyu.github.io/heresay/")!

struct ReportButtonModifier: ViewModifier {
    @ObservedObject var heresay = Heresay.shared
    let alignment: Alignment?
    let showsButton: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    #if os(macOS)
    /// The note offering help shows in the window being used, not in every window.
    @Environment(\.controlActiveState) private var windowState
    #endif

    private var offer: HelpOffer? {
        #if os(macOS)
        windowState == .inactive ? nil : heresay.offer
        #else
        heresay.offer
        #endif
    }

    func body(content: Content) -> some View {
        let corner = alignment ?? heresay.style.alignment
        let top = corner.vertical == .top
        content
            .overlay(alignment: corner) {
                // The note sits by the button: above it, or below one at the top.
                VStack(alignment: corner.horizontal, spacing: 10) {
                    if top && showsButton && heresay.buttonVisible && !heresay.isPresented { ReportButton(heresay: heresay) }
                    if let offer {
                        NudgeCard(heresay: heresay, offer: offer)
                            .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: top ? .top : .bottom)))
                    }
                    if !top && showsButton && heresay.buttonVisible && !heresay.isPresented { ReportButton(heresay: heresay) }
                }
                .padding(heresay.style.offset)
                .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: heresay.offer)
            }
            .modifier(SheetPresenter(heresay: heresay))
            #if os(iOS)
            // A welcome sheet, like the ones apps show for what's new.
            .sheet(isPresented: $heresay.introPending) {
                IntroView(heresay: heresay) { heresay.introPending = false }
                    .heresayTypeface(heresay.style.typeface)
                    .preferredColorScheme(heresay.style.colorScheme)
                    .presentationDetents([.medium])
            }
            #else
            // Its own small window, like an app's welcome window, rather than an alert.
            .onReceive(heresay.$introPending) { pending in
                if pending { DispatchQueue.main.async { IntroWindow.show(heresay) } }
            }
            #endif
            .onAppear { if showsButton { heresay.hasButton = true } }
    }
}

// MARK: - The introduction

/// The one-time introduction: the mark, one line, one button.
struct IntroView: View {
    @ObservedObject var heresay: Heresay
    let finish: () -> Void

    private var badge: some View {
        HeresayMark.filled(heresay.markColor)
            .frame(width: 34, height: 34)
            .frame(width: 60, height: 60)
            .background(Circle().fill(heresay.markColor.opacity(0.14)))
            .accessibilityHidden(true)
    }

    private var words: some View {
        VStack(spacing: 8) {
            Text(heresay.introTitle)
                .font(.title2.weight(.bold))
                .accessibilityAddTraits(.isHeader)
            Text(heresay.introBody)
                .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }

    var body: some View {
        #if os(iOS)
        VStack(spacing: 16) {
            Spacer(minLength: 12)
            badge
            words
            Spacer(minLength: 12)
            Button { finish() } label: {
                Text(heresay.words[.gotIt]).fontWeight(.semibold).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(heresay.accent)
            SheetFooter(heresay: heresay)
        }
        .padding(.horizontal, 28)
        .padding(.top, 8)
        #else
        VStack(spacing: 0) {
            VStack(spacing: 14) {
                badge
                words
            }
            .padding(.horizontal, 36)
            .padding(.top, 40)
            .padding(.bottom, 24)
            Button(heresay.words[.gotIt]) { finish() }
                .keyboardShortcut(.defaultAction)
                .keyboardShortcut(.cancelAction)
                .controlSize(.large)
                .tint(heresay.accent)
                .padding(.bottom, 16)
            SheetFooter(heresay: heresay)
        }
        .frame(width: 440)
        #endif
    }
}

#if os(macOS)
/// The introduction's window: small, titled, centred on the app's window, closed by either button,
/// Escape or the close button. One at a time, however many windows the app has open.
@MainActor
enum IntroWindow {
    private static var window: NSWindow?
    private static var closing: NSObjectProtocol?
    static var isOpen: Bool { window != nil }

    static func show(_ heresay: Heresay) {
        guard heresay.introPending, window == nil else { return }
        heresay.introPending = false
        let parent = NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.orderedWindows.first { $0.isVisible && $0.canBecomeMain }
        let w = NSWindow(contentRect: .zero, styleMask: [.titled, .closable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        w.title = heresay.introTitle
        w.titleVisibility = .hidden
        w.titlebarAppearsTransparent = true
        w.isMovableByWindowBackground = true
        w.isReleasedWhenClosed = false
        w.standardWindowButton(.miniaturizeButton)?.isHidden = true
        w.standardWindowButton(.zoomButton)?.isHidden = true
        switch heresay.style.colorScheme {
        case .light?: w.appearance = NSAppearance(named: .aqua)
        case .dark?: w.appearance = NSAppearance(named: .darkAqua)
        default: break
        }
        let host = NSHostingController(rootView: IntroView(heresay: heresay) { w.close() }.heresayTypeface(heresay.style.typeface))
        w.contentViewController = host
        w.setContentSize(host.view.fittingSize)
        if let parent {
            let p = parent.frame, s = w.frame.size
            w.setFrameOrigin(NSPoint(x: p.midX - s.width / 2, y: p.midY - s.height / 2 + p.height / 8))
        } else {
            w.center()
        }
        closing = NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: w, queue: .main) { _ in
            MainActor.assumeIsolated {
                if let closing { NotificationCenter.default.removeObserver(closing) }
                closing = nil
                window = nil
                parent?.makeKeyAndOrderFront(nil)
            }
        }
        window = w
        w.makeKeyAndOrderFront(nil)
    }
}
#endif

/// A sheet, or on iPhone and iPad a full-screen cover when the style asks for `.large`.
struct SheetPresenter: ViewModifier {
    @ObservedObject var heresay: Heresay

    /// `.bar` layout: Your reports opens the normal sheet over the bar.
    @State private var mineOpen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isBar: Bool { heresay.style.layout == .bar }
    private var active: Bool { heresay.isPresented && !heresay.isDisabled }
    private var barShown: Bool { active && isBar && !mineOpen }

    private var shown: Binding<Bool> {
        Binding(get: { active && (!isBar || mineOpen) },
                set: { heresay.isPresented = $0; if !$0 { mineOpen = false } })
    }

    private var barAlignment: Alignment {
        #if os(macOS)
        heresay.style.alignment
        #else
        .bottom
        #endif
    }

    private var barEdge: Edge { barAlignment.vertical == .top ? .top : .bottom }

    private var bar: some View {
        let edge = barEdge
        return ZStack(alignment: barAlignment) {
            Color.clear.allowsHitTesting(false)
            if barShown {
                ReportBar(heresay: heresay) { mineOpen = true }
                    #if os(macOS)
                    .frame(maxWidth: 440)
                    .padding(heresay.style.offset)
                    #else
                    .frame(maxWidth: 560)
                    .padding(.horizontal, 12).padding(.bottom, 8)
                    #endif
                    .transition(reduceMotion ? .opacity : .move(edge: edge).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: barShown)
    }

    private var sheet: some View {
        ReportSheet(heresay: heresay)
            .heresayTypeface(heresay.style.typeface)
            .preferredColorScheme(heresay.style.colorScheme)
    }

    func body(content: Content) -> some View {
        let base = content
            .overlay { bar }
            .onChange(of: heresay.isPresented) { on in
                if !on { mineOpen = false }
                else if isBar, let tab = heresay.requestedTab, tab != .report { mineOpen = true }
            }
        #if os(iOS)
        if heresay.style.sheet == .large && !isBar {
            base.fullScreenCover(isPresented: shown) { sheet }
        } else {
            base.sheet(isPresented: shown) { sheet }
        }
        #else
        base.sheet(isPresented: shown) { sheet }
        #endif
    }
}

struct ReportButton: View {
    @ObservedObject var heresay: Heresay

    private var metrics: (font: Font, h: CGFloat, v: CGFloat, mark: CGFloat) {
        switch heresay.style.size {
        case .small: (.caption, 10, 6, 17)
        case .regular: (.subheadline, 14, 9, 22)
        case .large: (.body, 18, 12, 27)
        }
    }

    var body: some View {
        let st = heresay.style
        let m = metrics
        let filled = st.fill == .accent
        let shape = st.button == .icon ? AnyShape(Circle()) : AnyShape(Capsule())
        Button { heresay.present() } label: {
            HStack(spacing: 7) {
                HeresayMark.filled(filled ? .white : heresay.markColor).frame(width: m.mark, height: m.mark)
                if st.button == .pill { Text(heresay.buttonLabel).fontWeight(.semibold) }
            }
            .font(m.font)
            .foregroundStyle(filled ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
            .padding(.horizontal, st.button == .icon ? m.v + 1 : m.h)
            .padding(.vertical, st.button == .icon ? m.v + 1 : m.v)
            .glassOr(shape, tint: filled ? heresay.accent : nil) {
                $0.background {
                    if filled { shape.fill(heresay.accent) } else {
                        shape.fill(.regularMaterial).overlay(shape.stroke(Color.primary.opacity(0.12)))
                    }
                }
            }
            .overlay(alignment: .topTrailing) {
                if heresay.unseen > 0 {
                    Circle().fill(Color(red: 45 / 255, green: 212 / 255, blue: 191 / 255))
                        .frame(width: 10, height: 10)
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                        .offset(x: 2, y: -2)
                }
            }
            .shadow(color: .black.opacity(st.shadow == .none ? 0 : st.shadow == .strong ? 0.35 : 0.18),
                    radius: st.shadow == .strong ? 16 : 8, y: st.shadow == .strong ? 6 : 3)
        }
        .buttonStyle(.plain)
        .heresayTypeface(st.typeface)
        .heresayScheme(st.colorScheme)
        .accessibilityLabel(heresay.unseen > 0 ? heresay.words[.reportA11yUpdate] : heresay.words[.reportA11y])
        .help(heresay.words[.reportA11y] + " · " + heresay.words[.powered])
    }
}

/// "Powered by Heresay", a link. People should be able to tell the app uses an outside tool.
/// Not configurable.
struct PoweredBy: View {
    @ObservedObject var heresay: Heresay

    var body: some View {
        Link(destination: heresayURL) {
            HStack(spacing: 5) {
                HeresayMark.filled(heresay.markColor).frame(width: 15, height: 15)
                Text(heresay.words[.powered]).lineLimit(1).fixedSize(horizontal: true, vertical: false)
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

/// One line at the foot of every view: "Sent to this app's team · Powered by Heresay". Stacks
/// when text is large.
struct SheetFooter: View {
    @ObservedObject var heresay: Heresay
    /// Only "Powered by Heresay" (the steps layout's first screen).
    var compact = false

    private var link: some View {
        Link(destination: heresayURL) {
            HStack(spacing: 5) {
                HeresayMark.filled(heresay.markColor).frame(width: 14, height: 14).accessibilityHidden(true)
                Text(heresay.words[.powered]).fontWeight(.medium)
            }
        }
        .buttonStyle(.plain)
    }

    private var sentTo: some View { Text(heresay.words[.sentTo]) }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            if compact { link.fixedSize() }
            HStack(spacing: 6) { sentTo.fixedSize(); Text("·").accessibilityHidden(true); link.fixedSize() }
            VStack(spacing: 4) { sentTo; link }
        }
        .font(.caption)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20).padding(.vertical, 10)
        .overlay(alignment: .top) { Divider() }
    }
}

// MARK: - The sheet

/// The report form, and Your reports pushed over it. No tabs: one calm view at a time.
struct ReportSheet: View {
    @ObservedObject var heresay: Heresay
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page: Page
    @State private var prefsOpen: Bool
    @State private var type: ReportType?
    /// Steps layout: screen 2 (the text box) once a type is chosen.
    @State private var picked: Bool
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false
    @FocusState private var textFocused: Bool
    /// The natural height of the form, measured, so the sheet can fit it.
    @State private var fitHeight: CGFloat = 380
    @State private var keyboard: CGFloat = 0
    @State private var pulled = false

    enum Page { case report, mine }

    init(heresay: Heresay) {
        self.heresay = heresay
        let asked = heresay.requestedTab
        let prefs = asked == .preferences && heresay.style.showsPreferences
        _page = State(initialValue: asked == .mine || prefs ? .mine : .report)
        _prefsOpen = State(initialValue: prefs)
        let d = heresay.draft
        let preset = d.type.flatMap { heresay.style.types.contains($0) ? $0 : nil }
        _type = State(initialValue: preset)
        _picked = State(initialValue: preset != nil)
        _text = State(initialValue: d.text)
    }

    private var w: Words { heresay.words }

    private var canSend: Bool { !sending && type != nil && !text.trimmed.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                switch page {
                case .report:
                    VStack(spacing: 0) {
                        if sent { sentHeader; sentView }
                        else if heresay.style.layout == .steps && !picked { stepsHeader.measured(); stepsList }
                        else if heresay.style.layout == .steps { stepTwoHeader.measured(); form }
                        else { header.measured(); form }
                    }
                    .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
                case .mine:
                    VStack(spacing: 0) {
                        mineHeader
                        MineList(heresay: heresay, prefsOpen: $prefsOpen)
                    }
                    .transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            SheetFooter(heresay: heresay,
                        compact: heresay.style.layout == .steps && page == .report && !sent && !picked)
        }
        .onPreferenceChange(FitHeight.self) { if page == .report && !sent && $0 > 0 { fitHeight = $0 } }
        #if os(macOS)
        .frame(width: macWidth, height: page == .report && !sent ? min(max(fitHeight, 300), 620) : 540)
        .glassBackdrop()
        #else
        .modifier(PhoneSheetSizing(page: page == .mine ? .mine : sent ? .sent : .report,
                                   fit: fitHeight, keyboard: keyboard, pulled: $pulled,
                                   fixed: heresay.style.sheet == .compact))
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { n in
            let end = (n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect) ?? .zero
            let screen = UIScreen.main.bounds.height
            keyboard = end.minY >= screen ? 0 : max(0, screen - end.minY)
        }
        #endif
        .onChange(of: page) { _ in pulled = false }
        .onChange(of: sent) { _ in pulled = false }
        .task { await heresay.refresh() }
        .onAppear {
            heresay.requestedTab = nil
            heresay.draft = (nil, "")
            if page == .mine { heresay.markSeen() }
        }
    }

    #if os(macOS)
    private var macWidth: CGFloat {
        switch heresay.style.sheet {
        case .compact: 420
        case .regular: 480
        case .large: 600
        }
    }
    #endif

    private func go(_ p: Page) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { page = p }
        if p == .mine { heresay.markSeen() }
    }

    // MARK: Headers

    private var title: some View {
        HStack(spacing: 8) {
            HeresayMark.filled(heresay.markColor).frame(width: 24, height: 24).accessibilityHidden(true)
            Text(w[.report]).font(.headline).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                .accessibilityAddTraits(.isHeader)
        }
    }

    private var closeButton: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark.circle.fill")
                .font(.title2)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.secondary)
                .frame(minWidth: 36, minHeight: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(.cancelAction)
        .accessibilityLabel(w[.close])
        .help(w[.close])
    }

    private var mineButton: some View {
        Button { go(.mine) } label: {
            HStack(spacing: 6) {
                Text(w[.yourReports]).lineLimit(1).fixedSize(horizontal: true, vertical: false)
                if heresay.unseen > 0 { UnreadDot() }
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.vertical, 8).padding(.horizontal, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(heresay.unseen > 0 ? w[.yourReportsA11yUpdate] : w[.yourReports])
    }

    /// "Report", a quiet "Your reports", close. The title and the link stack when text is large.
    private var header: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { title; Spacer(minLength: 8); mineButton; closeButton }
            VStack(alignment: .leading, spacing: 4) {
                HStack { title; Spacer(minLength: 8); closeButton }
                mineButton
            }
        }
        .padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 6)
    }

    private var sentHeader: some View {
        HStack { Spacer(); closeButton }
            .padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 6)
    }

    private var mineHeader: some View {
        HStack(spacing: 8) {
            Button { if heresay.style.layout == .bar { dismiss() } else { go(.report) } } label: {
                Image(systemName: "chevron.left")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(heresay.accent)
                    .frame(minWidth: 36, minHeight: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(w[.back])
            .help(w[.back])
            Text(w[.yourReports]).font(.headline).accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            closeButton
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 6)
    }

    // MARK: Steps layout

    private func symbolTile(_ t: ReportType) -> some View {
        Image(systemName: t.symbol)
            .font(.title3)
            .foregroundStyle(.primary)
            .frame(width: 44, height: 44)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.06)))
            .accessibilityHidden(true)
    }

    private var clockButton: some View {
        Button { go(.mine) } label: {
            Image(systemName: "clock")
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(minWidth: 36, minHeight: 36)
                .overlay(alignment: .topTrailing) { if heresay.unseen > 0 { UnreadDot().offset(x: -2, y: 4) } }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(heresay.unseen > 0 ? w[.yourReportsA11yUpdate] : w[.yourReports])
        .help(w[.yourReports])
    }

    /// Screen 1: the mark and "What's going on?", Your reports, close.
    private var stepsHeader: some View {
        HStack(spacing: 10) {
            HeresayMark.filled(heresay.markColor).frame(width: 24, height: 24).accessibilityHidden(true)
            Text(w[.whatsGoingOn]).font(.headline).accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            clockButton
            closeButton
        }
        .padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 6)
    }

    /// Four full-width rows, one per type.
    private var stepsList: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(heresay.style.types) { t in
                    Button {
                        type = t
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { picked = true }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { textFocused = true }
                    } label: {
                        HStack(spacing: 14) {
                            symbolTile(t)
                            Text(t.label(w)).font(.body.weight(.semibold)).foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                                .accessibilityHidden(true)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Color.primary.opacity(0.03)))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.12)))
                        .contentShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(t.label(w))
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 8)
            .measured()
        }
    }

    /// Screen 2's header: back, the chosen type as a pill, Your reports, close.
    private var stepTwoHeader: some View {
        HStack(spacing: 8) {
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { picked = false; type = nil }
                textFocused = false
            } label: {
                Image(systemName: "chevron.left")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(heresay.accent)
                    .frame(minWidth: 36, minHeight: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(w[.back])
            .help(w[.back])
            if let type {
                Text(type.label(w))
                    .font(.footnote.weight(.semibold)).lineLimit(1)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .foregroundStyle(Color.white)
                    .background(Capsule().fill(heresay.accent))
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 8)
            clockButton
            closeButton
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 6)
    }

    // MARK: Report form

    private var form: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if heresay.style.layout != .steps { pills }
                    editor
                }
                .padding(.horizontal, 20).padding(.vertical, 8)
                .measured()
            }
            .scrollDismissesKeyboardIfAvailable()
            VStack(spacing: 10) {
                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.callout).foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                sendRow
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 12)
            .measured()
        }
    }

    /// One compact row of capsules, nothing picked. If the row can't fit (long words, large text)
    /// it scrolls sideways rather than wrapping or squeezing.
    private var pills: some View {
        let all = heresay.style.types
        return ViewThatFits(in: .horizontal) {
            pillGroup { HStack(spacing: 6) { ForEach(all) { pill($0) } }.frame(maxWidth: .infinity, alignment: .leading) }
            ScrollView(.horizontal, showsIndicators: false) {
                pillGroup { HStack(spacing: 6) { ForEach(all) { pill($0) } } }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(w[.whatIsIt])
    }

    @ViewBuilder private func pillGroup<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, macOS 26, *) { GlassEffectContainer(spacing: 6) { c() } } else { c() }
        #else
        c()
        #endif
    }

    private func pill(_ t: ReportType) -> some View {
        let on = type == t
        return Button {
            type = t
            textFocused = true
        } label: {
            Text(t.label(w))
                .font(.footnote.weight(.medium))
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .foregroundStyle(on ? Color.white : Color.primary)
                // The chosen pill always has a solid accent fill, so it can never be invisible
                // (glass is drawn over it, never instead of it).
                .background { if on { Capsule().fill(heresay.accent) } }
                .glassOr(Capsule(), tint: on ? heresay.accent : nil) {
                    $0.background(Capsule().fill(on ? heresay.accent : Color.primary.opacity(0.05)))
                        .overlay(Capsule().stroke(on ? Color.clear : Color.primary.opacity(0.12)))
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(t.label(w))
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private var editor: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .font(.body)
                .focused($textFocused)
                .frame(minHeight: 130)
                .accessibilityLabel(w[.whatHappened])
            if text.isEmpty {
                Text(heresay.style.placeholder ?? type?.placeholder(w) ?? w[.placeholder])
                    .foregroundStyle(.tertiary)
                    .padding(.top, Self.editorInset.height)
                    .padding(.leading, Self.editorInset.width)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: 12)
            .stroke(textFocused ? heresay.accent : Color.primary.opacity(0.12), lineWidth: textFocused ? 1.5 : 1))
    }

    private var sendRow: some View {
        let button = Button {
            Task { await submit() }
        } label: {
            HStack(spacing: 6) {
                if sending { HeresayGlance(.white).frame(width: 20, height: 20) }
                Text(sending ? w[.sending] : w[.send]).fontWeight(.semibold)
            }
            #if os(iOS)
            .frame(maxWidth: .infinity)
            #else
            .padding(.horizontal, 8)
            #endif
        }
        .prominentOrGlass()
        .controlSize(.large)
        .tint(heresay.accent)
        .keyboardShortcut(.return, modifiers: .command)
        .disabled(!canSend)
        .help(w[.sendHelp])
        #if os(iOS)
        return button
        #else
        return HStack { Spacer(); button }
        #endif
    }

    // MARK: Sent

    private var sentView: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 0)
            SentCheck(color: heresay.accent)
            VStack(spacing: 8) {
                Text(w[.sentLine]).font(.headline).multilineTextAlignment(.center)
                if let thanks = heresay.style.thanks {
                    Text(thanks).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: 340)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            Button { dismiss() } label: {
                Text(w[.done]).fontWeight(.semibold)
                    #if os(iOS)
                    .frame(maxWidth: .infinity)
                    #else
                    .padding(.horizontal, 12)
                    #endif
            }
            .prominentOrGlass()
            .controlSize(.large)
            .tint(heresay.accent)
            .keyboardShortcut(.defaultAction)
            #if os(iOS)
            .frame(maxWidth: 340)
            #endif
            .padding(.top, 4)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { UIAccessibilityAnnounce.post(w[.sentLine]) }
    }

    private func submit() async {
        guard let type, canSend else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            // Everything the app collects still goes, as before: crash, trail, device.
            _ = try await heresay.send(type: type, text: text.trimmed)
            textFocused = false
            sent = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Where the TextEditor starts its text, so the placeholder sits exactly on it.
    private static var editorInset: CGSize {
        #if os(macOS)
        CGSize(width: 5, height: 0)
        #else
        CGSize(width: 5, height: 8)
        #endif
    }
}

/// Adds up the natural heights of the parts of the form, so the sheet can be exactly that tall.
struct FitHeight: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value += nextValue() }
}

extension View {
    /// The accent button: glass-prominent on iOS and macOS 26 and later, bordered-prominent before.
    @ViewBuilder func prominentOrGlass() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, macOS 26, *) { buttonStyle(.glassProminent) } else { buttonStyle(.borderedProminent) }
        #else
        buttonStyle(.borderedProminent)
        #endif
    }

    func measured() -> some View {
        background(GeometryReader { Color.clear.preference(key: FitHeight.self, value: $0.size.height) })
    }

    /// Mac: a translucent backdrop. On macOS 26 the system sheet is already Liquid Glass, so
    /// only older systems get the material.
    @ViewBuilder func glassBackdrop() -> some View {
        #if os(macOS)
        if #available(macOS 26, *) { self } else { background(.regularMaterial) }
        #else
        self
        #endif
    }

    /// Liquid Glass in `shape` on iOS and macOS 26 and later (tinted when given a tint);
    /// otherwise `fallback`.
    @ViewBuilder func glassOr<S: Shape, F: View>(_ shape: S, tint: Color? = nil, interactive: Bool = true,
                                                  @ViewBuilder fallback: (Self) -> F) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, macOS 26, *) {
            glassEffect(interactive ? .regular.tint(tint).interactive() : .regular.tint(tint), in: shape)
        } else { fallback(self) }
        #else
        fallback(self)
        #endif
    }
}

#if os(iOS)
/// How tall the sheet is on iPhone: as tall as the form (plus the keyboard, when it is up), Your
/// reports taller. On iPad the system's form sheet sets the size.
struct PhoneSheetSizing: ViewModifier {
    enum Page { case report, mine, sent }
    let page: Page
    let fit: CGFloat
    let keyboard: CGFloat
    @Binding var pulled: Bool
    let fixed: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    private var form: PresentationDetent { .height(fit + (keyboard > 0 ? keyboard : 34)) }

    private var detents: Set<PresentationDetent> {
        switch page {
        // At accessibility text sizes the form is taller than the screen: give it all of it.
        case .report: typeSize.isAccessibilitySize ? [.large] : fixed ? [form] : [form, .large]
        case .mine: [.medium, .large]
        case .sent: [.medium]
        }
    }

    private var selection: Binding<PresentationDetent> {
        Binding(
            get: {
                if pulled && detents.contains(.large) { return .large }
                if typeSize.isAccessibilitySize && page == .report { return .large }
                switch page { case .report: return form; case .mine: return .large; case .sent: return .medium }
            },
            set: { pulled = $0 == .large })
    }

    func body(content: Content) -> some View {
        content.presentationDetents(detents, selection: selection)
    }
}
#endif

extension View {
    @ViewBuilder func scrollDismissesKeyboardIfAvailable() -> some View {
        #if os(iOS)
        if #available(iOS 16.0, *) { scrollDismissesKeyboard(.interactively) } else { self }
        #else
        self
        #endif
    }
}

/// Reads the result out loud: the sent view replaces what had focus.
enum UIAccessibilityAnnounce {
    @MainActor static func post(_ text: String) { NudgeCard.announce(text) }
}

/// The teal dot that says "something new" on Your reports.
struct UnreadDot: View {
    var body: some View {
        Circle().fill(Color(red: 45 / 255, green: 212 / 255, blue: 191 / 255))
            .frame(width: 9, height: 9)
            .accessibilityHidden(true)
    }
}

/// A check that draws itself: the ring, then the tick. Still when Reduce Motion is on.
struct SentCheck: View {
    let color: Color
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var ring: CGFloat = 0
    @State private var tick: CGFloat = 0

    var body: some View {
        ZStack {
            Circle().fill(color.opacity(0.1))
            Circle().trim(from: 0, to: ring)
                .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            CheckShape().trim(from: 0, to: tick)
                .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
        }
        .frame(width: 72, height: 72)
        .accessibilityHidden(true)
        .onAppear {
            if reduceMotion { ring = 1; tick = 1; return }
            withAnimation(.easeOut(duration: 0.4)) { ring = 1 }
            withAnimation(.easeOut(duration: 0.3).delay(0.35)) { tick = 1 }
        }
    }
}

struct CheckShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + r.width * 0.30, y: r.minY + r.height * 0.52))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.45, y: r.minY + r.height * 0.67))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.71, y: r.minY + r.height * 0.36))
        return p
    }
}

// MARK: - Your reports

struct MineList: View {
    @ObservedObject var heresay: Heresay
    @Binding var prefsOpen: Bool
    /// "Take back": the report being asked about, the optional reason, and any error.
    @State private var taking: SentReport?
    @State private var reason = ""
    @State private var takeError: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                if heresay.reports.isEmpty {
                    VStack(spacing: 10) {
                        HeresayMark.filled(Color.secondary.opacity(0.35)).frame(width: 44, height: 44)
                        Text(heresay.words[.none]).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                } else {
                    ForEach(heresay.reports) { card($0) }
                }
                if heresay.style.showsPreferences {
                    PreferencesRow(heresay: heresay, open: $prefsOpen).padding(.top, 8)
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 8)
        }
        .refreshable { await heresay.refresh() }
        .alert(heresay.words[.takeBackAsk], isPresented: Binding(get: { taking != nil }, set: { if !$0 { taking = nil } })) {
            TextField(heresay.words[.takeBackWhy], text: $reason)
            Button(heresay.words[.keep], role: .cancel) { taking = nil }
            Button(heresay.words[.takeBackYes], role: .destructive) {
                guard let r = taking else { return }
                let why = reason
                taking = nil
                Task {
                    do { try await heresay.withdraw(r.id, reason: why) } catch { takeError = error.localizedDescription }
                }
            }
        }
        .alert(takeError ?? "", isPresented: Binding(get: { takeError != nil }, set: { if !$0 { takeError = nil } })) {
            Button(heresay.words[.done]) { takeError = nil }
        }
    }

    private func card(_ r: SentReport) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(r.type.label(heresay.words)).fontWeight(.semibold)
                if let when = Self.date(r.createdAt) {
                    Text("·")
                    Text(when, format: .dateTime.day().month(.abbreviated).locale(Locale(identifier: heresay.words.lang)))
                }
            }
            .font(.caption).foregroundStyle(.secondary)
            Text(r.text).lineLimit(5).fixedSize(horizontal: false, vertical: true)
            StatusPill(status: r.status, label: r.status.label(heresay.words), accent: heresay.accent)
            if r.status == .declined, let why = r.declineReason {
                note(heresay.words[.why] + why, fill: Color.primary.opacity(0.06))
            }
            if r.status == .fixed, let fix = r.fixNote {
                note(fix, fill: heresay.accent.opacity(0.1))
            }
            if r.status == .withdrawn, let why = r.withdrawnReason {
                Text(heresay.words[.yourWhy] + why).font(.caption).foregroundStyle(.secondary)
            }
            if r.status == .fixed, let v = r.fixVersion {
                Text(heresay.words(.fixedIn, ["v": v]) + (heresay.isOlder(than: v) ? " " + heresay.words(.updateTo, ["v": v]) : ""))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if r.status == .open {
                Button(heresay.words[.takeBack]) { taking = r; reason = "" }
                    .buttonStyle(.borderless)
                    .font(.caption)
                    .tint(heresay.accent)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.primary.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.08)))
    }

    private func note(_ s: String, fill: Color) -> some View {
        Text(s).font(.callout).padding(8)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(fill))
    }

    static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}

struct StatusPill: View {
    let status: ReportStatus
    let label: String
    let accent: Color

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(color)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private var color: Color {
        switch status {
        case .open, .declined, .withdrawn: .secondary
        case .accepted: accent
        case .fixed: .green
        }
    }
}

// MARK: - Your name and email

/// At the bottom of Your reports, not a section of its own: "Signed in as X" when the app said who,
/// otherwise a row that opens to two optional fields. Saved as they type; sent only with reports
/// they send.
struct PreferencesRow: View {
    @ObservedObject var heresay: Heresay
    @Binding var open: Bool
    @State private var prefs: ReporterPrefs

    init(heresay: Heresay, open: Binding<Bool>) {
        self.heresay = heresay
        _open = open
        _prefs = State(initialValue: heresay.prefs)
    }

    private var w: Words { heresay.words }

    var body: some View {
        Group {
            if let who = heresay.signedInAs {
                VStack(alignment: .leading, spacing: 4) {
                    Text(w(.signedInAs, ["who": who])).font(.subheadline.weight(.medium))
                    if let email = heresay.userEmail, email != who {
                        Text(email).font(.footnote).foregroundStyle(.secondary)
                    }
                    Text(heresay.userEmail != nil ? w[.seesReply] : w[.sees])
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            } else {
                DisclosureGroup(isExpanded: $open) {
                    VStack(alignment: .leading, spacing: 8) {
                        TextField(w[.name], text: $prefs.name, prompt: Text(w[.name] + " · " + w[.optional]))
                            .textFieldStyle(.roundedBorder)
                            #if os(iOS)
                            .textContentType(.name)
                            #endif
                        TextField(w[.email], text: $prefs.email, prompt: Text(w[.email] + " · " + w[.optional]))
                            .textFieldStyle(.roundedBorder)
                            #if os(iOS)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            #endif
                        if prefs.emailLooksValid {
                            Text(w[.emailHint]).font(.footnote).foregroundStyle(.secondary)
                        } else {
                            Text(w[.emailBad]).font(.footnote).foregroundStyle(.red)
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    Text(w[.nameAndEmail]).font(.subheadline.weight(.medium))
                }
                .tint(.secondary)
            }
        }
        .padding(.vertical, 10)
        .overlay(alignment: .top) { Divider() }
        // A bad email is kept so they can fix it; it just isn't sent (`ReporterPrefs.reporter`).
        .onChange(of: prefs) { heresay.save($0) }
    }
}
