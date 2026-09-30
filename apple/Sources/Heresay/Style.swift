import SwiftUI

/// How Heresay looks in your app. **The defaults are the recommended setup**; change only what
/// your app needs. Pass it to `Heresay.configure(…, style:)`.
///
/// ```swift
/// Heresay.configure(key: "pk_…", url: url, accent: .purple,
///                   style: HeresayStyle(position: .bottomLeading, label: "Feedback"))
/// ```
///
/// Not configurable, on purpose: the Heresay mark on the button, the report types' names (they
/// set the priority), the Your reports tab (people read why a report was declined), and
/// "Powered by Heresay", so people can tell the app uses an outside tool.
public struct HeresayStyle: Equatable, Sendable {
    public enum Position: String, Sendable, CaseIterable { case bottomTrailing, bottomLeading, topTrailing, topLeading, bottom }
    public enum ButtonKind: String, Sendable, CaseIterable { case pill, icon }
    public enum Size: String, Sendable, CaseIterable { case regular, small, large }
    public enum Fill: String, Sendable, CaseIterable {
        /// Your accent colour, with white text. The usual look on iOS and macOS.
        case accent
        /// The system background, with your accent on the mark only.
        case neutral
    }
    public enum Shadow: String, Sendable, CaseIterable { case soft, none, strong }
    public enum Theme: String, Sendable, CaseIterable { case system, light, dark }
    public enum Typeface: String, Sendable, CaseIterable { case system, rounded, serif }
    public enum Sheet: String, Sendable, CaseIterable {
        /// A full-height sheet on iPhone; a regular sheet on iPad and Mac.
        case regular
        /// Half height on iPhone, pull up for more; a narrower sheet on Mac.
        case compact
        /// Full screen on iPhone and iPad; a wider sheet on Mac.
        case large
    }

    /// Which corner the button sits in (`.heresayReportButton()`).
    public var position: Position
    /// Points from the edges.
    public var offset: CGFloat
    /// The button's text. `nil`: "Report", in the sheet's language.
    public var label: String?
    public var button: ButtonKind
    public var size: Size
    public var fill: Fill
    public var shadow: Shadow
    /// Screens (as named with `Heresay.setScreen`) where the button stays hidden, e.g. "Checkout".
    public var hiddenOnScreens: Set<String>
    /// The mark takes your accent colour. `false` keeps the Heresay teal.
    public var markFollowsAccent: Bool
    public var theme: Theme
    public var typeface: Typeface
    /// `"en"`, `"fr"`, `"ta"` or `"hi"`. `nil`: the app's own language, falling back to English.
    public var language: String?
    /// The question in the text box before a type is picked.
    public var placeholder: String?
    /// The types people can pick, in this order. Their names never change.
    public var types: [ReportType]
    /// A line under "Sent. Thank you.", from the team. Don't promise a fix.
    public var thanks: String?
    public var sheet: Sheet
    public var showsPreferences: Bool

    public init(position: Position = .bottomTrailing, offset: CGFloat = 16, label: String? = nil,
                button: ButtonKind = .pill, size: Size = .regular, fill: Fill = .accent, shadow: Shadow = .soft,
                hiddenOnScreens: Set<String> = [], markFollowsAccent: Bool = true, theme: Theme = .system,
                typeface: Typeface = .system, language: String? = nil, placeholder: String? = nil,
                types: [ReportType] = ReportType.allCases, thanks: String? = nil, sheet: Sheet = .regular,
                showsPreferences: Bool = true) {
        self.position = position
        self.offset = min(max(offset, 0), 200)
        self.label = label.map { String($0.trimmed.prefix(40)) }?.nilIfEmpty
        self.button = button
        self.size = size
        self.fill = fill
        self.shadow = shadow
        self.hiddenOnScreens = hiddenOnScreens
        self.markFollowsAccent = markFollowsAccent
        self.theme = theme
        self.typeface = typeface
        self.language = language
        self.placeholder = placeholder.map { String($0.trimmed.prefix(120)) }?.nilIfEmpty
        // Keep the order given, drop repeats; none at all means all four.
        var seen = Set<ReportType>()
        let some = types.filter { seen.insert($0).inserted }
        self.types = some.isEmpty ? ReportType.allCases : some
        self.thanks = thanks.map { String($0.trimmed.prefix(160)) }?.nilIfEmpty
        self.sheet = sheet
        self.showsPreferences = showsPreferences
    }

    var alignment: Alignment {
        switch position {
        case .bottomTrailing: .bottomTrailing
        case .bottomLeading: .bottomLeading
        case .topTrailing: .topTrailing
        case .topLeading: .topLeading
        case .bottom: .bottom
        }
    }

    var colorScheme: ColorScheme? {
        switch theme {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

extension View {
    /// The style's typeface, where the OS has it (iOS 16.1, macOS 13).
    @ViewBuilder func heresayTypeface(_ t: HeresayStyle.Typeface) -> some View {
        if #available(iOS 16.1, macOS 13.0, *) {
            switch t {
            case .system: self
            case .rounded: fontDesign(.rounded)
            case .serif: fontDesign(.serif)
            }
        } else {
            self
        }
    }

    /// Light or dark only where asked; `nil` leaves the app's own.
    @ViewBuilder func heresayScheme(_ s: ColorScheme?) -> some View {
        if let s { environment(\.colorScheme, s) } else { self }
    }
}
