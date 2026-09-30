import Foundation

/// What the reporter says the thing is. They pick what they can judge; the team's order is
/// derived from it, never asked for.
public enum ReportType: String, Codable, CaseIterable, Sendable, Identifiable {
    case broken, confusing, improvement, idea
    public var id: String { rawValue }

    var symbol: String {
        switch self {
        case .broken: "exclamationmark.triangle"
        case .confusing: "questionmark.circle"
        case .improvement: "wand.and.stars"
        case .idea: "lightbulb"
        }
    }
}

public enum ReportStatus: String, Codable, Sendable {
    case open, accepted, fixed, declined
}

/// A report as its sender sees it: no other device's reports, no triager identity.
public struct SentReport: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let type: ReportType
    public let text: String
    public let status: ReportStatus
    public let declineReason: String?
    public let fixNote: String?
    public let createdAt: String
    public let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, type, text, status
        case declineReason = "decline_reason"
        case fixNote = "fix_note"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// Attached to every report, not typed by the reporter. Same fields as the web SDK sends.
struct ReportContext: Codable, Sendable, Equatable {
    var route: String?
    var appVersion: String?
    var platform: String
    var os: String?
    var browser: String?
    var userId: String?
    var userLabel: String?
    var userEmail: String? = nil
    var framework: String?
    /// The window's size in points, e.g. "1280x720". Layout bugs depend on it.
    var viewport: String? = nil

    enum CodingKeys: String, CodingKey {
        case route, platform, os, browser, framework, viewport
        case appVersion = "app_version"
        case userId = "user_id"
        case userLabel = "user_label"
        case userEmail = "user_email"
    }
}

/// What the person chose to tell the team, in Preferences. All optional, kept on the device, and
/// sent only with reports they send. Same fields as the web SDK.
public struct ReporterPrefs: Codable, Sendable, Equatable {
    public var name: String = ""
    public var email: String = ""
    /// Sent with every report: "I use VoiceOver", "usually on slow Wi-Fi".
    public var note: String = ""

    public init(name: String = "", email: String = "", note: String = "") {
        self.name = name; self.email = email; self.note = note
    }

    /// What goes to the server, or nil when there's nothing to say. When the app has said who is
    /// signed in, it speaks for them: only the note is theirs to add.
    func reporter(signedIn: Bool = false) -> Reporter? {
        let r = Reporter(name: signedIn ? nil : name.trimmed.nilIfEmpty,
                         email: signedIn || !emailLooksValid ? nil : email.trimmed.nilIfEmpty,
                         note: note.trimmed.nilIfEmpty)
        return r.name == nil && r.email == nil && r.note == nil ? nil : r
    }

    var emailLooksValid: Bool {
        let e = email.trimmed
        return e.isEmpty || e.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }

    struct Reporter: Codable, Sendable, Equatable {
        var name: String?
        var email: String?
        var note: String?
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
