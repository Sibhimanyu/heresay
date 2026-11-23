import SwiftUI

/// How the report opens. Chosen by the app's developer; the reporter never sees the choice.
public enum HeresayLayout: String, Sendable, CaseIterable {
    /// One sheet: the four types in a row, the text box under them, Send. The default.
    case composer
    /// Two steps: pick what it is from a list, then write. Reads like a guided form.
    case steps
    /// Compact: a bar docked at the bottom (iPhone, iPad) or a small panel in the window (Mac) with a
    /// Type menu, one line of text and a send arrow.
    case bar
}

/// How Heresay looks in your app. **The defaults are the recommended setup**; change only what
/// your app needs. Pass it to `Heresay.configure(…, style:)`.
///
/// ```swift
/// Heresay.configure(key: "pk_…", url: url, accent: .purple,
///                   style: HeresayStyle(position: .bottomLeading, label: "Feedback"))
/// ```
///
/// Not configurable, on purpose: the Heresay mark on the button, the report types' names (they
/// set the priority), Your reports (people read why a report was declined), and
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
        /// A sheet that fits its form on iPhone (rises with the keyboard, pull up for more);
        /// a regular sheet on iPad and Mac.
        case regular
        /// Like regular on iPhone but fixed at the form's height, no pulling up; a narrower sheet on Mac.
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
    /// The question in the text box. Replaces the one that follows the type (“What went wrong?”,
    /// “What would you like?”…); `nil` keeps those.
    public var placeholder: String?
    /// The types people can pick, in this order. Their names never change.
    public var types: [ReportType]
    /// A line under "Sent. Thank you.", from the team. Don't promise a fix.
    public var thanks: String?
    public var sheet: Sheet
    /// Whether the “Your name and email” row (and “Signed in as …”) shows at the bottom of Your
    /// reports. Hide it if your app calls `identify()` and asks nothing else.
    public var showsPreferences: Bool
    /// How the report opens: `.composer` (default), `.steps` or `.bar`.
    public var layout: HeresayLayout

    public init(position: Position = .bottomTrailing, offset: CGFloat = 16, label: String? = nil,
                button: ButtonKind = .pill, size: Size = .regular, fill: Fill = .accent, shadow: Shadow = .soft,
                hiddenOnScreens: Set<String> = [], markFollowsAccent: Bool = true, theme: Theme = .system,
                typeface: Typeface = .system, language: String? = nil, placeholder: String? = nil,
                types: [ReportType] = ReportType.allCases, thanks: String? = nil, sheet: Sheet = .regular,
                showsPreferences: Bool = true, layout: HeresayLayout = .composer) {
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
        self.layout = layout
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
