import Foundation

/// What the reporter says the thing is. They pick what they can judge; the team's order is
/// derived from it, never asked for.
public enum ReportType: String, Codable, CaseIterable, Sendable, Identifiable {
    case broken, confusing, improvement, idea
    public var id: String { rawValue }

    var label: String {
        switch self {
        case .broken: "Broken"
        case .confusing: "Confusing"
        case .improvement: "Could be better"
        case .idea: "Idea"
        }
    }

    var hint: String {
        switch self {
        case .broken: "Something doesn’t work"
        case .confusing: "I couldn’t tell how"
        case .improvement: "It works, and could be better"
        case .idea: "Something that isn’t there yet"
        }
    }

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

    var label: String {
        switch self {
        case .open: "Waiting for the developer"
        case .accepted: "Accepted, being worked on"
        case .fixed: "Fixed"
        case .declined: "Declined"
        }
    }
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
    var framework: String?

    enum CodingKeys: String, CodingKey {
        case route, platform, os, browser, framework
        case appVersion = "app_version"
        case userId = "user_id"
        case userLabel = "user_label"
    }
}
