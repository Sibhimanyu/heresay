import SwiftUI

/// The `.bar` layout: a compact bar, not a sheet. Docked at the bottom on iPhone and iPad (above the
/// keyboard), a small panel in the window on Mac. A Type menu, one growing line of text, a send
/// arrow; under it Your reports, "Powered by Heresay" and close.
struct ReportBar: View {
    @ObservedObject var heresay: Heresay
    let openMine: () -> Void
    @State private var type: ReportType?
    @State private var text: String
    @State private var sending = false
    @State private var error: String?
    @State private var sent = false
    @FocusState private var focused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(heresay: Heresay, openMine: @escaping () -> Void) {
        self.heresay = heresay
        self.openMine = openMine
        let d = KeptDraft.start(asked: heresay.draft, kept: heresay.kept)
        _type = State(initialValue: d.type.flatMap { heresay.style.types.contains($0) ? $0 : nil })
        _text = State(initialValue: d.text)
    }

    private var w: Words { heresay.words }
    private var canSend: Bool { !sending && type != nil && !text.trimmed.isEmpty }
    private let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)

    var body: some View {
        Group {
            if sent { sentBody } else { composeBody }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .glassOr(shape, interactive: false) {
            $0.background(shape.fill(.regularMaterial))
                .overlay(shape.stroke(Color.primary.opacity(0.12)))
                .shadow(color: .black.opacity(0.18), radius: 14, y: 4)
        }
        .heresayTypeface(heresay.style.typeface)
        .heresayScheme(heresay.style.colorScheme)
        .onAppear {
            heresay.requestedTab = nil
            heresay.draft = (nil, "")
            if type != nil || !text.isEmpty { focused = true } else { DispatchQueue.main.async { focused = true } }
        }
        .task { await heresay.refresh() }
        .onDisappear { if !sent { heresay.keep(type: type, text: text) } }
        .accessibilityElement(children: .contain)
    }

    // MARK: Compose

    private var composeBody: some View {
        VStack(spacing: 6) {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    HStack { typeMenu; Spacer(minLength: 8); sendButton }
                    field
                }
            } else {
                HStack(alignment: .center, spacing: 8) { typeMenu; field; sendButton }
            }
            if let error {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            footerRow
        }
    }

    private var typeMenu: some View {
        let chip = HStack(spacing: 5) {
            if let type { Image(systemName: type.symbol).accessibilityHidden(true) }
            Text(type?.label(w) ?? w[.typeChip]).lineLimit(1)
            Image(systemName: "chevron.down").font(.caption2.weight(.bold)).accessibilityHidden(true)
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(type == nil ? Color.primary : heresay.accent)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Capsule().fill(type == nil ? Color.primary.opacity(0.07) : heresay.accent.opacity(0.14)))
        .fixedSize(horizontal: true, vertical: false)
        return Menu {
            ForEach(heresay.style.types) { t in
                Button { type = t; focused = true } label: { Label(t.label(w), systemImage: t.symbol) }
            }
        } label: { chip }
        #if os(macOS)
        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
        #else
        .buttonStyle(.plain)
        #endif
        .accessibilityLabel(w[.whatIsIt])
        .accessibilityValue(type?.label(w) ?? "")
    }

    private var field: some View {
        TextField(w[.tellTeam], text: $text, axis: .vertical)
            .lineLimit(1...4)
            .focused($focused)
            .textFieldStyle(.plain)
            .font(.body)
            .accessibilityLabel(w[.whatHappened])
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 34)
    }

    private var sendButton: some View {
        Button { Task { await submit() } } label: {
            Group {
                if sending { HeresayGlance(.white).frame(width: 22, height: 22) }
                else { Image(systemName: "arrow.up").font(.body.weight(.bold)) }
            }
            #if os(macOS)
            .frame(width: 20, height: 20)
            #else
            .foregroundStyle(canSend || sending ? Color.white : Color.secondary)
            .frame(width: 36, height: 36)
            .background(Circle().fill(canSend || sending ? heresay.accent : Color.primary.opacity(0.1)))
            .contentShape(Circle())
            #endif
        }
        #if os(macOS)
        .prominentCircle(accent: heresay.accent)
        #else
        .buttonStyle(.plain)
        #endif
        .keyboardShortcut(.return, modifiers: .command)
        .disabled(!canSend)
        .accessibilityLabel(sending ? w[.sending] : w[.send])
        .help(w[.sendHelp])
    }

    private var footerRow: some View {
        HStack(spacing: 8) {
            Button {
                heresay.requestedTab = .mine
                openMine()
            } label: {
                Image(systemName: "clock")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 36, minHeight: 32)
                    .overlay(alignment: .topTrailing) { if heresay.unseen > 0 { UnreadDot().offset(x: -3, y: 2) } }
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(heresay.unseen > 0 ? w[.yourReportsA11yUpdate] : w[.yourReports])
            .help(w[.yourReports])
            Spacer(minLength: 4)
            powered
            Spacer(minLength: 4)
            closeButton
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    private var powered: some View {
        Link(destination: heresayURL) {
            HStack(spacing: 5) {
                HeresayMark.filled(heresay.markColor).frame(width: 13, height: 13).accessibilityHidden(true)
                Text(w[.powered]).lineLimit(1).minimumScaleFactor(0.8)
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
    }

    private var closeButton: some View {
        Button { heresay.isPresented = false } label: {
            Image(systemName: "xmark")
                .font(.body.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(minWidth: 36, minHeight: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(.cancelAction)
        .accessibilityLabel(w[.close])
        .help(w[.close])
    }

    // MARK: Sent

    private var sentBody: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(heresay.accent)
                .accessibilityHidden(true)
            Text(heresay.style.thanks.map { w[.sentShort] + " " + $0 } ?? w[.sentShort])
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button { heresay.isPresented = false } label: {
                #if os(macOS)
                Text(w[.done]).font(.subheadline.weight(.semibold))
                #else
                Text(w[.done]).font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .foregroundStyle(Color.white)
                    .background(Capsule().fill(heresay.accent))
                #endif
            }
            #if os(macOS)
            .prominentOrGlass().tint(heresay.accent)
            #else
            .buttonStyle(.plain)
            #endif
            .keyboardShortcut(.defaultAction)
        }
        .padding(.vertical, 4)
        .onAppear { UIAccessibilityAnnounce.post(w[.sentShort]) }
    }

    private func submit() async {
        guard let type, canSend else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            _ = try await heresay.send(type: type, text: text.trimmed)
            focused = false
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { sent = true }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension View {
    /// The Mac bar's send arrow: a round accent glass button (bordered-prominent before macOS 26).
    @ViewBuilder func prominentCircle(accent: Color) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26, macOS 26, *) { buttonStyle(.glassProminent).buttonBorderShape(.circle).tint(accent) }
        else { buttonStyle(.borderedProminent).tint(accent) }
        #else
        buttonStyle(.borderedProminent).tint(accent)
        #endif
    }
}
