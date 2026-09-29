import SwiftUI

// MARK: - Entry points

public extension View {
    /// A Report button in the bottom corner, and the sheet it opens. The usual choice on iOS.
    func heresayReportButton(alignment: Alignment = .bottomTrailing) -> some View {
        modifier(ReportButtonModifier(alignment: alignment, showsButton: true))
    }

    /// Only the sheet, for apps that open it from their own button, menu or shortcut
    /// (`Heresay.present()` or `HeresayCommands` on macOS).
    func heresay() -> some View {
        modifier(ReportButtonModifier(alignment: .bottomTrailing, showsButton: false))
    }
}

#if os(macOS)
/// Help › Report a Problem… (⌥⌘R). Add with `.commands { HeresayCommands() }`, and put
/// `.heresay()` on the window's root view so the sheet has somewhere to open.
public struct HeresayCommands: Commands {
    public init() {}
    public var body: some Commands {
        CommandGroup(after: .help) {
            Button("Report a Problem…") { Heresay.present() }
                .keyboardShortcut("r", modifiers: [.command, .option])
        }
    }
}
#endif

struct ReportButtonModifier: ViewModifier {
    @ObservedObject var heresay = Heresay.shared
    let alignment: Alignment
    let showsButton: Bool

    func body(content: Content) -> some View {
        content
            .overlay(alignment: alignment) {
                if showsButton && !heresay.isDisabled { ReportButton(heresay: heresay).padding(16) }
            }
            .sheet(isPresented: Binding(
                get: { heresay.isPresented && !heresay.isDisabled },
                set: { heresay.isPresented = $0 }
            )) {
                ReportSheet(heresay: heresay)
            }
    }
}

struct ReportButton: View {
    @ObservedObject var heresay: Heresay

    var body: some View {
        Button { heresay.present() } label: {
            HStack(spacing: 7) {
                HeresayMark.filled(.white).frame(width: 18, height: 18)
                Text("Report").fontWeight(.semibold)
            }
            .font(.subheadline)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Capsule().fill(Color.heresayPeacock))
            .overlay(alignment: .topTrailing) {
                if heresay.unseen > 0 {
                    Circle().fill(Color(red: 45 / 255, green: 212 / 255, blue: 191 / 255))
                        .frame(width: 10, height: 10)
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                        .offset(x: 2, y: -2)
                }
            }
            .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(heresay.unseen > 0 ? "Report a problem. You have an update." : "Report a problem")
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
        _tab = State(initialValue: heresay.requestedTab ?? (heresay.unseen > 0 ? .mine : .report))
    }

    private var canSend: Bool { !sending && type != nil && !text.trimmed.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            header
            Picker("", selection: $tab) {
                Text("Report").tag(SheetTab.report)
                Text(heresay.unseen > 0 ? "Your reports ●" : "Your reports").tag(SheetTab.mine)
                Text("Preferences").tag(SheetTab.preferences)
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

            if tab == .report && !sent { footer } else { doneBar }
        }
        #if os(macOS)
        .frame(minWidth: 440, idealWidth: 480, minHeight: 520, idealHeight: 580)
        #endif
        .task { await heresay.refresh() }
        .onChange(of: tab) { t in if t == .mine { heresay.markSeen() } }
        .onAppear {
            heresay.requestedTab = nil
            if tab == .mine { heresay.markSeen() }
        }
    }

    // MARK: Header and footer

    private var header: some View {
        HStack(spacing: 12) {
            HeresayMark.filled(heresay.markColor)
                .frame(width: 30, height: 30)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("Send feedback").font(.headline)
                Text(Self.appName.map { "Straight to the \($0) team" } ?? "Straight to the team behind this app")
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
            .accessibilityLabel("Close")
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
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                #endif
                Button {
                    Task { await submit() }
                } label: {
                    Text(sending ? "Sending…" : "Send").fontWeight(.semibold)
                        #if os(iOS)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        #endif
                }
                .buttonStyle(.borderedProminent)
                .tint(heresay.accent)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(!canSend)
                .help("Send (⌘↩)")
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
                Button("Done") { dismiss() }
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
        heresay.prefs.reporter(signedIn: heresay.isSignedIn) != nil
            ? "Sent with this screen, the app version and your preferences."
            : "Sent with this screen and the app version."
    }

    // MARK: Report form

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("What is it?").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                typePicker
                Text("What happened?").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    .padding(.top, 8)
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .scrollContentBackground(.hidden)
                        .font(.body)
                        .focused($textFocused)
                        .frame(minHeight: 120)
                        .accessibilityLabel("What happened?")
                    if text.isEmpty {
                        Text(type?.placeholder ?? "What happened, or what would you change?")
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

    /// One row per type on a phone, where two columns would wrap every label; a 2×2 grid of
    /// equal cards everywhere else.
    @ViewBuilder private var typePicker: some View {
        let all = ReportType.allCases
        if narrow {
            VStack(spacing: 8) { ForEach(all) { typeCard($0) } }
        } else {
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow { typeCard(all[0]); typeCard(all[1]) }
                GridRow { typeCard(all[2]); typeCard(all[3]) }
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
                    Text(t.label).font(.callout.weight(.semibold)).foregroundStyle(.primary)
                    Text(t.hint).font(.caption).foregroundStyle(.secondary)
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
        .accessibilityLabel("\(t.label). \(t.hint)")
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
            Text("Sent. Thank you.").font(.title3.weight(.semibold))
            Text("A person on the team reads every report. You’ll see what happens to it under Your reports.")
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            HStack {
                Button("Send another") { sent = false; type = nil; text = "" }
                Button("See your reports") { tab = .mine }.buttonStyle(.borderedProminent).tint(heresay.accent)
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

extension ReportType {
    /// A nudge that fits the kind of report, once it's picked.
    var placeholder: String {
        switch self {
        case .broken: "What did you do, and what went wrong?"
        case .confusing: "What were you trying to do?"
        case .improvement: "What would make it better?"
        case .idea: "What would you like it to do?"
        }
    }
}

// MARK: - Your reports

struct MineList: View {
    @ObservedObject var heresay: Heresay

    var body: some View {
        if heresay.reports.isEmpty {
            VStack(spacing: 10) {
                HeresayMark.filled(Color.secondary.opacity(0.35)).frame(width: 44, height: 44)
                Text("Nothing sent from this device yet.").foregroundStyle(.secondary)
            }
            .padding(40)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            List(heresay.reports) { r in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        StatusPill(status: r.status, accent: heresay.accent)
                        Spacer()
                        Label(r.type.label, systemImage: r.type.symbol)
                            .font(.caption).foregroundStyle(.secondary)
                        if let when = Self.date(r.createdAt) {
                            Text(when, format: .dateTime.day().month(.abbreviated))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Text(r.text).lineLimit(4)
                    if r.status == .declined, let why = r.declineReason {
                        note("Why: \(why)", fill: Color.primary.opacity(0.06))
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
    let accent: Color

    var body: some View {
        Text(status.label)
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
                            Text("Signed in as \(who)").fontWeight(.semibold)
                            if let email = heresay.userEmail, email != who {
                                Text(email).font(.callout).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                } header: {
                    Text("You")
                } footer: {
                    Text(heresay.userEmail != nil
                         ? "The team sees this with each report, and can reply to you."
                         : "The team sees this with each report.")
                }
            } else {
                Section {
                    TextField("Name", text: $prefs.name, prompt: Text("Optional"))
                        #if os(iOS)
                        .textContentType(.name)
                        #endif
                    TextField("Email", text: $prefs.email, prompt: Text("Optional"))
                        #if os(iOS)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        #endif
                } header: {
                    Text("About you")
                } footer: {
                    if prefs.emailLooksValid {
                        Text("Only if you’re happy for the team to reply to you.")
                    } else {
                        Text("That email doesn’t look right, so it won’t be sent.").foregroundStyle(.red)
                    }
                }
            }

            Section {
                TextField("About your setup", text: $prefs.note,
                          prompt: Text("For example: I use VoiceOver, or I’m usually on slow Wi-Fi."),
                          axis: .vertical)
                    .labelsHidden()
                    .multilineTextAlignment(.leading)
                    .lineLimit(3...6)
            } header: {
                Text("Your setup")
            } footer: {
                Text("Sent with every report, so you only have to say it once. Kept on this device.")
            }

            if prefs != ReporterPrefs() {
                Section {
                    Button("Clear all", role: .destructive) { prefs = ReporterPrefs() }
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
