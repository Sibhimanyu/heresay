import SwiftUI

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

    func body(content: Content) -> some View {
        content
            .overlay(alignment: alignment ?? heresay.style.alignment) {
                if showsButton && heresay.buttonVisible { ReportButton(heresay: heresay).padding(heresay.style.offset) }
            }
            .modifier(SheetPresenter(heresay: heresay))
            .alert(heresay.introTitle, isPresented: $heresay.introPending) {
                Button(heresay.words[.tryIt]) { heresay.present(.report) }
                Button(heresay.words[.gotIt], role: .cancel) {}
            } message: {
                Text(heresay.introMessage)
            }
            .onAppear { if showsButton { heresay.hasButton = true } }
    }
}

/// A sheet, or on iPhone and iPad a full-screen cover when the style asks for `.large`.
struct SheetPresenter: ViewModifier {
    @ObservedObject var heresay: Heresay

    private var shown: Binding<Bool> {
        Binding(get: { heresay.isPresented && !heresay.isDisabled }, set: { heresay.isPresented = $0 })
    }

    private var sheet: some View {
        ReportSheet(heresay: heresay)
            .heresayTypeface(heresay.style.typeface)
            .preferredColorScheme(heresay.style.colorScheme)
            #if os(iOS)
            .presentationDetents(heresay.style.sheet == .compact ? [.medium, .large] : [.large])
            #endif
    }

    func body(content: Content) -> some View {
        #if os(iOS)
        if heresay.style.sheet == .large {
            content.fullScreenCover(isPresented: shown) { sheet }
        } else {
            content.sheet(isPresented: shown) { sheet }
        }
        #else
        content.sheet(isPresented: shown) { sheet }
        #endif
    }
}

struct ReportButton: View {
    @ObservedObject var heresay: Heresay

    private var metrics: (font: Font, h: CGFloat, v: CGFloat, mark: CGFloat) {
        switch heresay.style.size {
        case .small: (.caption, 10, 6, 14)
        case .regular: (.subheadline, 14, 9, 18)
        case .large: (.body, 18, 12, 22)
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
            .background {
                if filled { shape.fill(heresay.accent) } else {
                    shape.fill(.regularMaterial).overlay(shape.stroke(Color.primary.opacity(0.12)))
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

/// "Powered by Heresay", on every tab. People should be able to tell the app uses an outside
/// tool. Not configurable.
struct PoweredBy: View {
    @ObservedObject var heresay: Heresay

    var body: some View {
        Link(destination: heresayURL) {
            HStack(spacing: 5) {
                HeresayMark.filled(heresay.markColor).frame(width: 12, height: 12)
                Text(heresay.words[.powered])
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }
}

// MARK: - The sheet

struct ReportSheet: View {
    @ObservedObject var heresay: Heresay
    @Environment(\.dismiss) private var dismiss
    @State private var tab: SheetTab
    @State private var type: ReportType?
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false
    @FocusState private var textFocused: Bool
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif

    init(heresay: Heresay) {
        self.heresay = heresay
        var first = heresay.requestedTab ?? (heresay.unseen > 0 ? .mine : .report)
        if first == .preferences && !heresay.style.showsPreferences { first = .report }
        _tab = State(initialValue: first)
        let d = heresay.draft
        _type = State(initialValue: d.type.flatMap { heresay.style.types.contains($0) ? $0 : nil })
        _text = State(initialValue: d.text)
    }

    private var w: Words { heresay.words }

    private var canSend: Bool { !sending && type != nil && !text.trimmed.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            header
            Picker("", selection: $tab) {
                Text(w[.tabReport]).tag(SheetTab.report)
                Text(heresay.unseen > 0 ? w[.tabMine] + " ●" : w[.tabMine]).tag(SheetTab.mine)
                if heresay.style.showsPreferences { Text(w[.tabPrefs]).tag(SheetTab.preferences) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .tint(heresay.accent)
            .padding(.horizontal, 20)
            .padding(.bottom, 12)

            Divider()

            Group {
                switch tab {
                case .report: if sent { sentView } else { form }
                case .mine: MineList(heresay: heresay)
                case .preferences: PreferencesForm(heresay: heresay)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            PoweredBy(heresay: heresay)

            if tab == .report && !sent { footer } else { doneBar }
        }
        #if os(macOS)
        .frame(minWidth: macWidth - 40, idealWidth: macWidth, minHeight: 520, idealHeight: 600)
        #endif
        .task { await heresay.refresh() }
        .onChange(of: tab) { t in if t == .mine { heresay.markSeen() } }
        .onAppear {
            heresay.requestedTab = nil
            heresay.draft = (nil, "")
            if tab == .mine { heresay.markSeen() }
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

    // MARK: Header and footer

    private var header: some View {
        HStack(spacing: 12) {
            HeresayMark.filled(heresay.markColor)
                .frame(width: 30, height: 30)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(w[.sendFeedback]).font(.headline)
                Text(Self.appName.map { w(.straightToApp, ["app": $0]) } ?? w[.straightToTeam])
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            #if os(iOS)
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(w[.close])
            #endif
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 14)
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: 10) {
                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.callout).foregroundStyle(.red).lineLimit(2)
                } else {
                    Text(attachedLine).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 8)
                #if os(macOS)
                Button(w[.cancel]) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                #endif
                Button {
                    Task { await submit() }
                } label: {
                    Text(sending ? w[.sending] : w[.send]).fontWeight(.semibold)
                        #if os(iOS)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        #endif
                }
                .buttonStyle(.borderedProminent)
                .tint(heresay.accent)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(!canSend)
                .help(w[.sendHelp])
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(.bar)
    }

    /// macOS sheets have no swipe-down or close box: every tab needs a way out.
    @ViewBuilder private var doneBar: some View {
        #if os(macOS)
        VStack(spacing: 0) {
            Divider()
            HStack {
                Spacer()
                Button(w[.done]) { dismiss() }
                    .tint(heresay.accent)
                    .keyboardShortcut(.defaultAction)
                    .keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(.bar)
        #endif
    }

    /// What goes with the report, said plainly, so nobody wonders.
    private var attachedLine: String {
        heresay.prefs.reporter(signedIn: heresay.isSignedIn) != nil ? w[.attachedPrefs] : w[.attached]
    }

    // MARK: Report form

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(w[.whatIsIt]).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                typePicker
                Text(w[.whatHappened]).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    .padding(.top, 8)
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .scrollContentBackground(.hidden)
                        .font(.body)
                        .focused($textFocused)
                        .frame(minHeight: 120)
                        .accessibilityLabel(w[.whatHappened])
                    if text.isEmpty {
                        Text(type?.placeholder(w) ?? heresay.style.placeholder ?? w[.placeholder])
                            .foregroundStyle(.tertiary)
                            .padding(.top, Self.editorInset.height)
                            .padding(.leading, Self.editorInset.width)
                            .allowsHitTesting(false)
                    }
                }
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.04)))
                .overlay(RoundedRectangle(cornerRadius: 10)
                    .stroke(textFocused ? heresay.accent : Color.primary.opacity(0.12), lineWidth: textFocused ? 1.5 : 1))
            }
            .padding(20)
        }
    }

    /// One row per type on a phone, where two columns would wrap every label; a grid of equal
    /// cards, two to a row, everywhere else.
    @ViewBuilder private var typePicker: some View {
        let all = heresay.style.types
        if narrow {
            VStack(spacing: 8) { ForEach(all) { typeCard($0) } }
        } else {
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                ForEach(Array(stride(from: 0, to: all.count, by: 2)), id: \.self) { i in
                    GridRow {
                        typeCard(all[i])
                        if i + 1 < all.count { typeCard(all[i + 1]) } else { Color.clear.gridCellUnsizedAxes([.horizontal, .vertical]) }
                    }
                }
            }
        }
    }

    private var narrow: Bool {
        #if os(iOS)
        sizeClass == .compact
        #else
        false
        #endif
    }

    private func typeCard(_ t: ReportType) -> some View {
        let on = type == t
        return Button {
            type = t
            textFocused = true
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: t.symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(on ? .white : heresay.accent)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(on ? heresay.accent : heresay.accent.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.label(w)).font(.callout.weight(.semibold)).foregroundStyle(.primary)
                    Text(t.hint(w)).font(.caption).foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: narrow ? 0 : 64, maxHeight: .infinity, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 12).fill(on ? heresay.accent.opacity(0.10) : Color.primary.opacity(0.04)))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(on ? heresay.accent : Color.primary.opacity(0.08), lineWidth: on ? 2 : 1))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityLabel("\(t.label(w)). \(t.hint(w))")
    }

    private var sentView: some View {
        VStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                HeresayMark.filled(heresay.markColor).frame(width: 64, height: 64)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(.white, Color.green)
                    .offset(x: 6, y: 4)
            }
            .padding(.bottom, 4)
            Text(w[.sentTitle]).font(.title3.weight(.semibold))
            if let thanks = heresay.style.thanks {
                Text(thanks).multilineTextAlignment(.center).frame(maxWidth: 320)
            }
            Text(w[.sentBody])
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            HStack {
                Button(w[.sendAnother]) { sent = false; type = nil; text = "" }
                Button(w[.seeReports]) { tab = .mine }.buttonStyle(.borderedProminent).tint(heresay.accent)
            }
            .padding(.top, 6)
        }
        .padding(32)
        .frame(maxHeight: .infinity)
    }

    private func submit() async {
        guard let type, canSend else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            _ = try await heresay.send(type: type, text: text.trimmed)
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

    static var appName: String? {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)?.nilIfEmpty
            ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String)?.nilIfEmpty
    }
}

// MARK: - Your reports

struct MineList: View {
    @ObservedObject var heresay: Heresay

    var body: some View {
        if heresay.reports.isEmpty {
            VStack(spacing: 10) {
                HeresayMark.filled(Color.secondary.opacity(0.35)).frame(width: 44, height: 44)
                Text(heresay.words[.none]).foregroundStyle(.secondary)
            }
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List(heresay.reports) { r in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        StatusPill(status: r.status, label: r.status.label(heresay.words), accent: heresay.accent)
                        Spacer()
                        Label(r.type.label(heresay.words), systemImage: r.type.symbol)
                            .font(.caption).foregroundStyle(.secondary)
                        if let when = Self.date(r.createdAt) {
                            Text(when, format: .dateTime.day().month(.abbreviated).locale(Locale(identifier: heresay.words.lang)))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Text(r.text).lineLimit(4)
                    if r.status == .declined, let why = r.declineReason {
                        note(heresay.words[.why] + why, fill: Color.primary.opacity(0.06))
                    }
                    if r.status == .fixed, let fix = r.fixNote {
                        note(fix, fill: heresay.accent.opacity(0.1))
                    }
                }
                .padding(.vertical, 6)
            }
            #if os(macOS)
            .listStyle(.inset)
            #else
            .listStyle(.plain)
            #endif
            .refreshable { await heresay.refresh() }
        }
    }

    private func note(_ s: String, fill: Color) -> some View {
        Text(s).font(.callout).padding(8)
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
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(color)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private var color: Color {
        switch status {
        case .open, .declined: .secondary
        case .accepted: accent
        case .fixed: .green
        }
    }
}

// MARK: - Preferences

/// Saved as they type; nothing to press. Sent only with reports they send. When the app has said
/// who is signed in, it shows that instead of asking for a name and email.
struct PreferencesForm: View {
    @ObservedObject var heresay: Heresay
    @State private var prefs: ReporterPrefs

    init(heresay: Heresay) {
        self.heresay = heresay
        _prefs = State(initialValue: heresay.prefs)
    }

    private var w: Words { heresay.words }

    var body: some View {
        Form {
            if let who = heresay.signedInAs {
                Section {
                    HStack(spacing: 12) {
                        Text(Self.initials(who))
                            .font(.callout.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(heresay.accent))
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(w(.signedInAs, ["who": who])).fontWeight(.semibold)
                            if let email = heresay.userEmail, email != who {
                                Text(email).font(.callout).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                } header: {
                    Text(w[.you])
                } footer: {
                    Text(heresay.userEmail != nil ? w[.seesReply] : w[.sees])
                }
            } else {
                Section {
                    TextField(w[.name], text: $prefs.name, prompt: Text(w[.optional]))
                        #if os(iOS)
                        .textContentType(.name)
                        #endif
                    TextField(w[.email], text: $prefs.email, prompt: Text(w[.optional]))
                        #if os(iOS)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        #endif
                } header: {
                    Text(w[.aboutYou])
                } footer: {
                    if prefs.emailLooksValid {
                        Text(w[.emailHint])
                    } else {
                        Text(w[.emailBad]).foregroundStyle(.red)
                    }
                }
            }

            Section {
                TextField(w[.setupLabel], text: $prefs.note,
                          prompt: Text(w[.setupPrompt]),
                          axis: .vertical)
                    .labelsHidden()
                    .multilineTextAlignment(.leading)
                    .lineLimit(3...6)
            } header: {
                Text(w[.yourSetup])
            } footer: {
                Text(w[.setupFooter])
            }

            if prefs != ReporterPrefs() {
                Section {
                    Button(w[.clearAll], role: .destructive) { prefs = ReporterPrefs() }
                }
            }
        }
        .formStyle(.grouped)
        .tint(heresay.accent)
        // A bad email is kept so they can fix it; it just isn't sent (`ReporterPrefs.reporter`).
        .onChange(of: prefs) { heresay.save($0) }
    }

    static func initials(_ s: String) -> String {
        s.split(whereSeparator: { " @.".contains($0) }).prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    }
}
