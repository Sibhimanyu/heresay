import Foundation
import XCTest
@testable import Heresay

/// Answers requests from a closure instead of the network, and records what was sent.
/// A negative status fails the request the way being offline does (a thrown URLError).
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest, Data) -> (Int, Data))?
    nonisolated(unsafe) static var sent: [(URLRequest, Data)] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var body = request.httpBody ?? Data()
        if body.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buf = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; body.append(buf, count: n) }
        }
        Self.sent.append((request, body))
        let (status, data) = Self.handler?(request, body) ?? (500, Data())
        if status < 0 { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}

    static func session() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: c)
    }
}

private let sample = """
{"id":"r_1","type":"broken","text":"Export does nothing","status":"fixed","decline_reason":null,
 "fix_note":"Export now downloads a CSV.","created_at":"2026-09-30T10:00:00Z","updated_at":"2026-09-30T11:00:00Z"}
"""

final class ModelTests: XCTestCase {
    func testDecodesWhatTheServerSends() throws {
        let r = try JSONDecoder().decode(SentReport.self, from: Data(sample.utf8))
        XCTAssertEqual(r.type, .broken)
        XCTAssertEqual(r.status, .fixed)
        XCTAssertEqual(r.fixNote, "Export now downloads a CSV.")
        XCTAssertNil(r.declineReason)
    }

    func testOlderServersWithoutFixNoteStillDecode() throws {
        let old = sample.replacingOccurrences(of: #""fix_note":"Export now downloads a CSV.","#, with: "")
        XCTAssertNil(try JSONDecoder().decode(SentReport.self, from: Data(old.utf8)).fixNote)
    }

    func testContextUsesTheSameFieldNamesAsTheWebSDK() throws {
        let c = ReportContext(route: "Checkout", appVersion: "1.4 (22)", platform: "ios", os: "iOS 18.1",
                              browser: nil, userId: "u1", userLabel: "Asha", framework: "swiftui")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(c)) as! [String: Any]
        XCTAssertEqual(json["app_version"] as? String, "1.4 (22)")
        XCTAssertEqual(json["user_label"] as? String, "Asha")
        XCTAssertEqual(json["platform"] as? String, "ios")
        XCTAssertNil(json["appVersion"])
    }

    func testTypesCoverTheFourTheServerAccepts() {
        XCTAssertEqual(ReportType.allCases.map(\.rawValue), ["broken", "confusing", "improvement", "idea"])
    }
}

final class ClientTests: XCTestCase {
    override func setUp() { StubProtocol.sent = []; StubProtocol.handler = nil }

    func testSubmitPostsKeyDeviceTypeTextAndContext() async throws {
        StubProtocol.handler = { _, _ in (201, Data(#"{"report":\#(sample)}"#.utf8)) }
        let c = Client(base: URL(string: "https://x.web.app")!, key: "pk_test", session: StubProtocol.session())
        let ctx = ReportContext(route: "Home", appVersion: "1.0", platform: "ios", os: "iOS 18", browser: nil, userId: nil, userLabel: nil, framework: "swiftui")
        let r = try await c.submit(deviceId: "ios_0123456789abcdef", type: .confusing, text: "Where is cancel?", context: ctx)
        XCTAssertEqual(r.id, "r_1")
        let (req, body) = StubProtocol.sent[0]
        XCTAssertEqual(req.url?.absoluteString, "https://x.web.app/v1/reports")
        XCTAssertEqual(req.httpMethod, "POST")
        let json = try JSONSerialization.jsonObject(with: body) as! [String: Any]
        XCTAssertEqual(json["key"] as? String, "pk_test")
        XCTAssertEqual(json["device_id"] as? String, "ios_0123456789abcdef")
        XCTAssertEqual(json["type"] as? String, "confusing")
        XCTAssertEqual((json["context"] as? [String: Any])?["route"] as? String, "Home")
        XCTAssertEqual(json["sdk"] as? String, Heresay.platform)
    }

    func testMineAsksForThisDevicesReports() async throws {
        StubProtocol.handler = { _, _ in (200, Data(#"{"reports":[\#(sample)]}"#.utf8)) }
        let c = Client(base: URL(string: "https://x.web.app")!, key: "pk_test", session: StubProtocol.session())
        let rs = try await c.mine(deviceId: "ios_0123456789abcdef")
        XCTAssertEqual(rs.count, 1)
        XCTAssertEqual(StubProtocol.sent[0].0.url?.path, "/v1/reports/mine")
        let json = try JSONSerialization.jsonObject(with: StubProtocol.sent[0].1) as! [String: Any]
        XCTAssertEqual(json["sdk"] as? String, Heresay.platform, "lets the dashboard see the SDK is installed")
    }

    func testErrorsAreSentencesNotCodes() async {
        StubProtocol.handler = { _, _ in (429, Data(#"{"error":"too many reports, try again later"}"#.utf8)) }
        let c = Client(base: URL(string: "https://x.web.app")!, key: "pk", session: StubProtocol.session())
        do {
            _ = try await c.mine(deviceId: "ios_0123456789abcdef")
            XCTFail("expected a failure")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Too many reports from this device. Try again a little later.")
        }
        XCTAssertEqual(Client.explain(404, "unknown key"), "Unknown key.")
        XCTAssertEqual(Client.explain(0, nil), "Couldn’t reach the server. Check your connection.")
    }
}

@MainActor
final class HeresayTests: XCTestCase {
    private func fresh() -> (Heresay, UserDefaults) {
        let name = "heresay.tests.\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        return (Heresay(defaults: d), d)
    }

    func testDeviceIdIsStableAndLongEnough() {
        let (h, _) = fresh()
        let a = h.deviceId
        XCTAssertEqual(a, h.deviceId)
        XCTAssertGreaterThanOrEqual(a.count, 16)
        XCTAssertLessThanOrEqual(a.count, 64)
        XCTAssertNotNil(a.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression))
    }

    func testAnOutcomeCountsAsUnseenUntilLookedAt() async throws {
        let (h, _) = fresh()
        StubProtocol.handler = { _, _ in (200, Data(#"{"reports":[\#(sample)]}"#.utf8)) }
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1.0", accent: nil, session: StubProtocol.session())
        await h.refresh()
        XCTAssertEqual(h.unseen, 1)
        h.markSeen()
        XCTAssertEqual(h.unseen, 0)
        await h.refresh()
        XCTAssertEqual(h.unseen, 0, "stays read")
    }

    func testAnUnknownKeyHidesHeresay() async {
        let (h, _) = fresh()
        StubProtocol.handler = { _, _ in (404, Data(#"{"error":"unknown key"}"#.utf8)) }
        h.configure(key: "pk_gone", url: URL(string: "https://x.web.app")!, version: "1.0", accent: nil, session: StubProtocol.session())
        await h.refresh()
        XCTAssertTrue(h.isDisabled)
        h.present()
        XCTAssertFalse(h.isPresented, "the sheet doesn't open for a deleted app")
    }

    func testBeingOfflineDoesNotHideHeresay() async {
        let (h, _) = fresh()
        StubProtocol.handler = { _, _ in (-1, Data()) }
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1.0", accent: nil, session: StubProtocol.session())
        await h.refresh()
        XCTAssertFalse(h.isDisabled)
        h.present()
        XCTAssertTrue(h.isPresented)
    }

    func testOtherServerErrorsDoNotHideHeresay() async {
        let (h, _) = fresh()
        StubProtocol.handler = { _, _ in (500, Data()) }
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1.0", accent: nil, session: StubProtocol.session())
        await h.refresh()
        XCTAssertFalse(h.isDisabled)
    }

    func testContextCarriesScreenVersionAndWhoIsSignedIn() {
        Heresay.shared.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "2.1", accent: nil, session: StubProtocol.session())
        Heresay.setScreen("Settings")
        Heresay.identify(id: "u_9", label: "Sam")
        let c = Heresay.shared.context()
        XCTAssertEqual(c.route, "Settings")
        XCTAssertEqual(c.appVersion, "2.1")
        XCTAssertEqual(c.userId, "u_9")
        XCTAssertEqual(c.platform, Heresay.platform)
        XCTAssertTrue(c.os?.hasPrefix("macOS") == true || c.os?.hasPrefix("iOS") == true || c.os?.hasPrefix("iPadOS") == true)
        Heresay.identify()
        XCTAssertNil(Heresay.shared.context().userId, "sign-out clears it")
    }
}

/// Sends a real report when pointed at a Heresay:
/// HERESAY_TEST_URL=http://127.0.0.1:5055 HERESAY_TEST_KEY=pk_… swift test
@MainActor
final class LiveTests: XCTestCase {
    func testAReportReachesTheServerAndComesBack() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["HERESAY_TEST_URL"].flatMap(URL.init(string:)), let key = env["HERESAY_TEST_KEY"] else {
            throw XCTSkip("set HERESAY_TEST_URL and HERESAY_TEST_KEY to run against a Heresay")
        }
        // The shared instance, the way an app uses it: configure, then name the screen.
        let h = Heresay.shared
        h.configure(key: key, url: url, version: "0.0.1-swift-test", accent: nil, session: .shared)
        Heresay.setScreen("LiveTests")
        let sent = try await h.send(type: .idea, text: "Sent from the Swift SDK tests on \(Heresay.platform)")
        XCTAssertEqual(sent.status, .open)
        await h.refresh()
        XCTAssertTrue(h.reports.contains { $0.id == sent.id })
    }
}

final class PreferencesTests: XCTestCase {
    func testNothingFilledInSendsNothing() {
        XCTAssertNil(ReporterPrefs().reporter())
        XCTAssertNil(ReporterPrefs(name: "  ").reporter())
    }

    func testABadEmailIsKeptToFixButNotSent() {
        let p = ReporterPrefs(name: "Asha", email: "not an email", note: "I use VoiceOver")
        XCTAssertFalse(p.emailLooksValid)
        XCTAssertEqual(p.reporter(), .init(name: "Asha", email: nil, note: "I use VoiceOver"))
        XCTAssertEqual(ReporterPrefs(email: " asha@example.org ").reporter()?.email, "asha@example.org")
    }

    func testSignedInTheAppSpeaksForThemAndOnlyTheNoteIsSent() {
        let p = ReporterPrefs(name: "Typed name", email: "typed@example.org", note: "VoiceOver")
        XCTAssertEqual(p.reporter(signedIn: true), .init(name: nil, email: nil, note: "VoiceOver"))
        XCTAssertNil(ReporterPrefs(name: "Typed").reporter(signedIn: true))
    }

    func testSubmitSendsTheReporterAndViewportLikeTheWebSDK() async throws {
        StubProtocol.sent = []
        StubProtocol.handler = { _, _ in (201, Data(#"{"report":\#(sample)}"#.utf8)) }
        let c = Client(base: URL(string: "https://x.web.app")!, key: "pk", session: StubProtocol.session())
        var ctx = ReportContext(route: "Home", appVersion: "1.0", platform: "ios", os: "iOS 18", browser: nil, userId: nil, userLabel: nil, framework: "swiftui")
        ctx.viewport = "390x844"
        _ = try await c.submit(deviceId: "ios_0123456789abcdef", type: .idea, text: "x", context: ctx,
                               reporter: ReporterPrefs(name: "Asha", note: "VoiceOver").reporter())
        let json = try JSONSerialization.jsonObject(with: StubProtocol.sent[0].1) as! [String: Any]
        XCTAssertEqual((json["context"] as? [String: Any])?["viewport"] as? String, "390x844")
        let reporter = json["reporter"] as? [String: Any]
        XCTAssertEqual(reporter?["name"] as? String, "Asha")
        XCTAssertEqual(reporter?["note"] as? String, "VoiceOver")
        XCTAssertNil(reporter?["email"], "unset fields are left out")
    }
}

@MainActor
final class SavedPreferencesTests: XCTestCase {
    func testPreferencesSurviveARelaunch() {
        let d = UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!
        Heresay(defaults: d).save(ReporterPrefs(name: "Asha", note: "VoiceOver"))
        let again = Heresay(defaults: d)
        XCTAssertEqual(again.prefs.name, "Asha")
        XCTAssertEqual(again.prefs.note, "VoiceOver")
    }

    func testIdentifySendsTheSignedInEmail() {
        let h = Heresay(defaults: UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!)
        h.identify(id: "u1", label: "Sibhi", email: "sibhi@example.com")
        XCTAssertTrue(h.isSignedIn)
        XCTAssertEqual(h.context().userEmail, "sibhi@example.com")
        h.identify(id: nil, label: nil, email: nil)
        XCTAssertFalse(h.isSignedIn)
    }
}

@MainActor
final class IntroductionTests: XCTestCase {
    func testShowsOncePerInstallAndSaysWhereToLook() {
        let d = UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!
        let h = Heresay(defaults: d)
        XCTAssertTrue(h.introduce())
        XCTAssertTrue(h.introPending)
        h.introPending = false
        XCTAssertFalse(h.introduce(), "never twice")
        XCTAssertFalse(Heresay(defaults: d).introduce(), "not after a relaunch either")
        XCTAssertTrue(h.introMessage.contains("A person reads every report"))
    }
}
