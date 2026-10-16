import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// The device around the app, sent with each report: what layout, language and timing bugs depend
/// on. The same fields as the web SDK sends. Nothing here identifies the person.
@MainActor
enum Device {
    /// "MacBookPro18,3", "iPhone16,1"; in the simulator, the device it plays.
    static func model() -> String? {
        #if os(macOS)
        var size = 0
        guard sysctlbyname("hw.model", nil, &size, nil, 0) == 0, size > 1 else { return nil }
        var buf = [CChar](repeating: 0, count: size)
        guard sysctlbyname("hw.model", &buf, &size, nil, 0) == 0 else { return nil }
        return String(decoding: buf.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self).nilIfEmpty
        #else
        if let sim = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return sim + " (simulator)" }
        var u = utsname()
        uname(&u)
        return withUnsafeBytes(of: &u.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }.nilIfEmpty
        #endif
    }

    static func locale() -> String? { Locale.current.identifier(.bcp47).nilIfEmpty }

    static func timezone() -> String? { TimeZone.current.identifier.nilIfEmpty }

    static func theme() -> String? {
        #if os(macOS)
        guard let app = NSApp as NSApplication? else { return nil }
        return app.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? "dark" : "light"
        #else
        switch window()?.traitCollection.userInterfaceStyle ?? UITraitCollection.current.userInterfaceStyle {
        case .dark: return "dark"
        case .light: return "light"
        default: return nil
        }
        #endif
    }

    /// The display in points and its scale: "1512x982@2x".
    static func screen() -> String? {
        #if os(macOS)
        guard let s = (NSApp as NSApplication?)?.keyWindow?.screen ?? NSScreen.main else { return nil }
        let size = s.frame.size, scale = s.backingScaleFactor
        #else
        guard let s = window()?.windowScene?.screen else { return nil }
        let size = s.bounds.size, scale = s.scale
        #endif
        let x = scale.rounded() == scale ? "\(Int(scale))" : String(format: "%.2g", scale)
        return "\(Int(size.width))x\(Int(size.height))@\(x)x"
    }

    /// Settings that change how the app looks or runs: "reduced motion, larger text (XXL)".
    static func settings() -> String? {
        var out: [String] = []
        #if os(macOS)
        let ws = NSWorkspace.shared
        if ws.accessibilityDisplayShouldReduceMotion { out.append("reduced motion") }
        if ws.accessibilityDisplayShouldIncreaseContrast { out.append("more contrast") }
        if ws.accessibilityDisplayShouldReduceTransparency { out.append("reduced transparency") }
        #else
        if UIAccessibility.isReduceMotionEnabled { out.append("reduced motion") }
        if UIAccessibility.isDarkerSystemColorsEnabled { out.append("more contrast") }
        if UIAccessibility.isBoldTextEnabled { out.append("bold text") }
        if let size = textSize(UIApplication.shared.preferredContentSizeCategory) { out.append(size) }
        #endif
        if ProcessInfo.processInfo.isLowPowerModeEnabled { out.append("low power") }
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: out.append("running hot")
        default: break
        }
        return out.isEmpty ? nil : out.joined(separator: ", ")
    }

    #if os(iOS)
    /// Only when it isn't the default: layouts break at the large accessibility sizes.
    static func textSize(_ c: UIContentSizeCategory) -> String? {
        switch c {
        case .extraSmall, .small, .medium: "smaller text"
        case .extraLarge: "larger text (XL)"
        case .extraExtraLarge: "larger text (XXL)"
        case .extraExtraExtraLarge: "larger text (XXXL)"
        case .accessibilityMedium, .accessibilityLarge, .accessibilityExtraLarge,
             .accessibilityExtraExtraLarge, .accessibilityExtraExtraExtraLarge: "accessibility text size"
        default: nil
        }
    }

    private static func window() -> UIWindow? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first
    }
    #endif

    /// "5 s", "2:10 min": how long someone was away.
    nonisolated static func away(_ s: Int) -> String {
        s >= 60 ? "\(s / 60):\(String(format: "%02d", s % 60)) min" : "\(s) s"
    }
}
