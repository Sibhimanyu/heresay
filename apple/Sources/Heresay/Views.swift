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
            HStack(spacing: 6) {
                Image(systemName: "quote.bubble.fill")
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
    @State private var tab: Tab
    @State private var type: ReportType?
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false

    enum Tab: Hashable { case report, mine }

    init(heresay: Heresay) {
        self.heresay = heresay
        _tab = State(initialValue: heresay.unseen > 0 ? .mine : .report)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    Text("Report").tag(Tab.report)
                    Text(heresay.unseen > 0 ? "Your reports ●" : "Your reports").tag(Tab.mine)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .padding()
                Group {
                    switch tab {
                    case .report: sent ? AnyView(sentView) : AnyView(form)
                    case .mine: AnyView(MineList(heresay: heresay))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .navigationTitle("Heresay")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
        .tint(heresay.accent)
        #if os(macOS)
        .frame(minWidth: 420, idealWidth: 460, minHeight: 480, idealHeight: 540)
        #endif
        .task { await heresay.refresh() }
        .onChange(of: tab) { t in if t == .mine { heresay.markSeen() } }
        .onAppear { if tab == .mine { heresay.markSeen() } }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("What is it?").font(.headline)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(ReportType.allCases) { t in
                        Button { type = t } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Image(systemName: t.symbol)
                                Text(t.label).fontWeight(.semibold)
                                Text(t.hint).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 12).fill(type == t ? heresay.accent.opacity(0.12) : Color.gray.opacity(0.08)))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(type == t ? heresay.accent : .clear, lineWidth: 2))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(type == t ? .isSelected : [])
                        .accessibilityLabel("\(t.label). \(t.hint)")
                    }
                }
                Text("What happened?").font(.headline)
                TextEditor(text: $text)
                    .frame(minHeight: 110)
                    .padding(6)
                    .background(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.35)))
                    .accessibilityLabel("What happened?")
                Text("The screen you’re on and the app version are sent with it.")
                    .font(.caption).foregroundStyle(.secondary)
                if let error { Text(error).font(.callout).foregroundStyle(.red) }
                Button {
                    Task { await submit() }
                } label: {
                    Text(sending ? "Sending…" : "Send").fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .disabled(sending || type == nil || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
    }

    private var sentView: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(heresay.accent)
            Text("Sent. Thank you.").font(.title3.weight(.semibold))
            Text("You’ll see what happens to it under Your reports.").foregroundStyle(.secondary).multilineTextAlignment(.center)
            HStack {
                Button("Send another") { sent = false; type = nil; text = "" }
                Button("See your reports") { tab = .mine }.buttonStyle(.borderedProminent)
            }
            .padding(.top, 6)
        }
        .padding(32)
    }

    private func submit() async {
        guard let type else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            _ = try await heresay.send(type: type, text: text.trimmingCharacters(in: .whitespacesAndNewlines))
            sent = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct MineList: View {
    @ObservedObject var heresay: Heresay

    var body: some View {
        if heresay.reports.isEmpty {
            Text("Nothing sent from this device yet.").foregroundStyle(.secondary).padding(32)
        } else {
            List(heresay.reports) { r in
                VStack(alignment: .leading, spacing: 6) {
                    Text(r.status.label)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(r.status == .declined ? .secondary : (r.status == .open ? .secondary : heresay.accent))
                    Text(r.text).lineLimit(4)
                    Text(r.type.label).font(.caption).foregroundStyle(.secondary)
                    if r.status == .declined, let why = r.declineReason {
                        Text("Why: \(why)").font(.callout).padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.gray.opacity(0.1)))
                    }
                    if r.status == .fixed, let note = r.fixNote {
                        Text(note).font(.callout).padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 8).fill(heresay.accent.opacity(0.1)))
                    }
                }
                .padding(.vertical, 4)
            }
            .refreshable { await heresay.refresh() }
        }
    }
}
