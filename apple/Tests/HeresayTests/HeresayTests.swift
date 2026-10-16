import Foundation
import OSLog
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

    /// The body of the last report sent; `configure` also asks for this device's reports.
    static var lastSubmit: Data { sent.last { $0.0.url?.path.hasSuffix("/v1/reports") == true }!.1 }

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
        // In the app's own log, so it goes with the report (the trail), where the log can be read.
        Logger(subsystem: "dev.heresay.tests.live", category: "live").error("Live test error for the trail")
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
        XCTAssertTrue(h.introMessage.contains("A real person reads every report"))
    }
}

@MainActor
final class StyleTests: XCTestCase {
    private func fresh() -> Heresay { Heresay(defaults: UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!) }

    func testEveryLanguageSaysEverything() {
        for lang in Words.languages {
            let t = Words.tables[lang]!
            XCTAssertEqual(Set(t.keys), Set(W.allCases), "\(lang) is missing words")
            XCTAssertTrue(t.values.allSatisfy { !$0.trimmed.isEmpty }, lang)
            XCTAssertTrue(t[.introBody]!.contains("{reach}"), lang)
            XCTAssertTrue(t[.powered]!.contains("Heresay"), "\(lang) names Heresay")
        }
    }

    func testTheLanguageIsTheAppsUnlessTheStyleSaysOtherwise() {
        XCTAssertEqual(Words("ta").lang, "ta")
        XCTAssertEqual(Words("hi-IN").lang, "hi")
        XCTAssertEqual(Words("de").lang, "en", "a language Heresay doesn't speak falls back to English")
        XCTAssertEqual(Words(nil).lang, "en", "the test bundle is English")
        XCTAssertEqual(Words("fr")(.straightToApp, ["app": "Notes"]), "Directement à l’équipe Notes")
    }

    func testTheDefaultsAreTheRecommendedSetup() {
        let s = HeresayStyle()
        XCTAssertEqual(s.position, .bottomTrailing)
        XCTAssertEqual(s.fill, .accent)
        XCTAssertTrue(s.markFollowsAccent)
        XCTAssertTrue(s.showsPreferences)
        XCTAssertEqual(s.types, ReportType.allCases)
        XCTAssertNil(s.colorScheme)
    }

    func testTextIsTrimmedAndCutAndTypesKeepTheirNames() {
        let s = HeresayStyle(offset: 900, label: "  " + String(repeating: "x", count: 60), types: [.confusing, .broken, .confusing])
        XCTAssertEqual(s.label?.count, 40)
        XCTAssertEqual(s.offset, 200)
        XCTAssertEqual(s.types, [.confusing, .broken], "order kept, repeats dropped")
        XCTAssertEqual(HeresayStyle(label: "   ", types: []).label, nil)
        XCTAssertEqual(HeresayStyle(types: []).types, ReportType.allCases, "none means all four")
    }

    func testTheButtonHidesOnTheScreensTheStyleNames() {
        let h = fresh()
        h.setStyle(HeresayStyle(hiddenOnScreens: ["Checkout"]))
        XCTAssertTrue(h.buttonVisible)
        Heresay.shared.setStyle(HeresayStyle(hiddenOnScreens: ["Checkout"]))
        Heresay.setScreen("Checkout")
        XCTAssertFalse(Heresay.shared.buttonVisible)
        Heresay.setScreen("Notes")
        XCTAssertTrue(Heresay.shared.buttonVisible)
        Heresay.shared.setStyle(HeresayStyle())
        Heresay.setScreen(nil)
    }

    func testTheLabelAndTheIntroductionSpeakTheStylesLanguageAndSayPoweredByHeresay() {
        let h = fresh()
        h.setStyle(HeresayStyle(language: "hi"))
        XCTAssertEqual(h.buttonLabel, "रिपोर्ट करें")
        XCTAssertTrue(h.introMessage.hasSuffix("Heresay द्वारा संचालित"))
        h.setStyle(HeresayStyle(label: "Feedback"))
        XCTAssertEqual(h.buttonLabel, "Feedback")
        XCTAssertTrue(h.introMessage.contains("“Feedback”"))
        XCTAssertTrue(h.introMessage.hasSuffix("Powered by Heresay"))
    }

    func testTheAppsOwnIntroductionWordsStillSayPoweredByHeresay() {
        let h = fresh()
        XCTAssertTrue(h.introduce(title: "New: tell us", message: "Two taps and we see it."))
        XCTAssertEqual(h.introTitle, "New: tell us")
        XCTAssertEqual(h.introMessage, "Two taps and we see it.\n\nPowered by Heresay")
    }

    func testTheMarkKeepsTheTealWhenAsked() {
        let h = fresh()
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1", accent: .purple,
                    style: HeresayStyle(markFollowsAccent: false), session: StubProtocol.session())
        XCTAssertEqual(h.markColor, .heresayMark)
        h.setStyle(HeresayStyle())
        XCTAssertEqual(h.markColor, .purple)
    }

    func testPresentFillsTheFormIn() {
        Heresay.present(type: .broken, text: "Export failed (E42)")
        XCTAssertEqual(Heresay.shared.draft.type, .broken)
        XCTAssertEqual(Heresay.shared.draft.text, "Export failed (E42)")
        XCTAssertEqual(Heresay.shared.requestedTab, .report)
        Heresay.shared.isPresented = false
        Heresay.shared.draft = (nil, "")
    }

    func testOnSentGetsTheIdAndTypeNeverTheText() async throws {
        StubProtocol.handler = { _, _ in (201, Data(#"{"report":\#(sample)}"#.utf8)) }
        var got: [SentEvent] = []
        Heresay.shared.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1", accent: nil, session: StubProtocol.session())
        Heresay.onSent { got.append($0) }
        _ = try await Heresay.send(.broken, text: "Export does nothing")
        XCTAssertEqual(got, [SentEvent(id: "r_1", type: .broken)])
    }
}

final class TrailTests: XCTestCase {
    func testScrubBlanksWhatIsPersonalOrSecretLikeTheServer() {
        let s = Trail.scrub("Sync failed for asha@example.com at https://api.x.com/v1/sync?token=abc with Bearer abc.def, card 4111 1111 1111 1111, id 3f2a9c1e7b4d4e8f9a0b1c2d3e4f5a6b7c8d", max: 400)!
        XCTAssertFalse(s.contains("asha@"))
        XCTAssertTrue(s.contains("https://api.x.com/v1/sync with"), "query string gone")
        XCTAssertTrue(s.contains("Bearer [token]"))
        XCTAssertTrue(s.contains("[number]"))
        XCTAssertTrue(s.contains("id [token]"))
        XCTAssertEqual(Trail.scrub("open /Users/priya/Documents/tax.pdf", max: 200), "open ~/Documents/tax.pdf")
        XCTAssertEqual(Trail.scrub("Build 2026", max: 200), "Build 2026", "short numbers stay")
        XCTAssertNil(Trail.scrub("  \u{0007} ", max: 200))
        XCTAssertEqual(Trail.scrub(String(repeating: "x", count: 500), max: 200)?.count, 200)
    }

    func testRepeatsAreCountedAndOnlyTheNewestThirtyKept() {
        let t = Trail()
        t.setParts(.all)
        t.note(.click, "button \"Save\"")
        t.note(.click, "button \"Save\"")
        XCTAssertEqual(t.recent().map(\.n), [2])
        for i in 0..<40 { t.note(.page, "Screen \(i)") }
        let r = t.recent()
        XCTAssertEqual(r.count, 30)
        XCTAssertEqual(r.last?.text, "Screen 39")
    }

    func testOnlyThePartsTheAppKeptAreRecorded() {
        let t = Trail()
        t.setParts([.screens])
        t.note(.click, "button \"Save\"")
        t.note(.error, "boom")
        t.note(.page, "Settings")
        t.note(.state, "Went offline")
        XCTAssertEqual(t.recent().map(\.kind), [.page, .state], "connection changes come with any part")
        t.setParts([])
        t.note(.state, "Back online")
        XCTAssertEqual(t.recent().count, 2, "off records nothing")
    }

    func testOlderThanFiveMinutesIsDroppedExceptTheLastCrash() {
        let t = Trail()
        t.setParts(.all)
        let now = Date()
        t.note(.page, "Old", at: now.addingTimeInterval(-400))
        t.note(.page, "New", at: now.addingTimeInterval(-10))
        let crash = Trail.Entry(kind: .error, at: now.addingTimeInterval(-7200), text: "The app crashed: EXC_BAD_ACCESS", detail: "Last run\nNotes +1234")
        let log = Trail.Entry(kind: .error, at: now.addingTimeInterval(-20), text: "sync: Sync failed")
        XCTAssertEqual(t.recent(now: now, adding: [crash, log]).map(\.text), ["The app crashed: EXC_BAD_ACCESS", "sync: Sync failed", "New"])
    }

    func testWhatIsSentHasAgesInSecondsAndLeavesOutSkippedKinds() {
        let now = Date()
        let e = [Trail.Entry(kind: .page, at: now.addingTimeInterval(-65), text: "Notes"),
                 Trail.Entry(kind: .click, at: now.addingTimeInterval(-3), text: "button \"Export\"", n: 2),
                 Trail.Entry(kind: .error, at: now.addingTimeInterval(-9000), text: "crash")]
        let sent = Trail.toSend(e, skip: [.click], now: now)!
        XCTAssertEqual(sent, [TrailEvent(kind: .page, ago: 65, text: "Notes", detail: nil, n: 1),
                              TrailEvent(kind: .error, ago: 3600, text: "crash", detail: nil, n: 1)])
        XCTAssertNil(Trail.toSend(e, skip: Set(TrailKind.allCases), now: now))
    }

    func testCrashFramesComeFromTheCrashedThread() {
        let json = #"{"callStacks":[{"threadAttributed":false,"callStackRootFrames":[{"binaryName":"libsystem","offsetIntoBinaryTextSegment":1}]},{"threadAttributed":true,"callStackRootFrames":[{"binaryName":"Notes","offsetIntoBinaryTextSegment":4242,"subFrames":[{"binaryName":"SwiftUI","offsetIntoBinaryTextSegment":77}]}]}]}"#
        XCTAssertEqual(Trail.frames(fromCallStackJSON: Data(json.utf8)), ["Notes +4242", "SwiftUI +77"])
        XCTAssertEqual(Trail.frames(fromCallStackJSON: Data("nope".utf8)), [])
    }

    @MainActor
    func testTheLastCrashGoesWithOneReportOnly() async throws {
        let d = UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!
        Trail.keepCrash(d, at: Date().addingTimeInterval(-600), text: "The app crashed: EXC_BAD_ACCESS: SIGSEGV", frames: ["Notes +4242"])
        XCTAssertEqual(Trail.lastCrash(d)?.detail, "Last run\nNotes +4242")
        XCTAssertNil(Trail.lastCrash(d, now: Date().addingTimeInterval(2 * 86_400)), "a day later it is too old to help")

        StubProtocol.sent = []
        StubProtocol.handler = { _, _ in (201, Data(#"{"report":\#(sample)}"#.utf8)) }
        let h = Heresay(defaults: d)
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1", accent: nil, trail: [.errors], session: StubProtocol.session())
        _ = try await h.send(type: .broken, text: "It crashed")
        let trail = (try JSONSerialization.jsonObject(with: StubProtocol.lastSubmit) as! [String: Any])["trail"] as? [[String: Any]]
        XCTAssertEqual(trail?.first?["text"] as? String, "The app crashed: EXC_BAD_ACCESS: SIGSEGV")
        XCTAssertEqual(trail?.first?["ago"] as? Int, 600)
        XCTAssertNil(Trail.lastCrash(d), "sent once")
    }

    @MainActor
    func testScreensGoInTheTrailAndTheReporterCanSendNone() async throws {
        StubProtocol.sent = []
        StubProtocol.handler = { _, _ in (201, Data(#"{"report":\#(sample)}"#.utf8)) }
        let h = Heresay(defaults: UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!)
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1", accent: nil, trail: [.screens], session: StubProtocol.session())
        h.setScreen("Notes")
        h.setScreen("Notes")
        h.setScreen("Settings")
        _ = try await h.send(type: .broken, text: "x")
        let body = try JSONSerialization.jsonObject(with: StubProtocol.lastSubmit) as! [String: Any]
        let trail = body["trail"] as! [[String: Any]]
        XCTAssertEqual(trail.map { $0["text"] as? String }, ["Notes", "Settings"], "the same screen again isn't a new one")
        XCTAssertEqual(Set(trail[0].keys), ["kind", "ago", "text", "n"], "the fields core/trail.ts reads; no detail when there is none")
        XCTAssertEqual(trail[0]["kind"] as? String, "page")

        _ = try await h.send(type: .broken, text: "x", trail: .some(nil))
        let off = try JSONSerialization.jsonObject(with: StubProtocol.lastSubmit) as! [String: Any]
        XCTAssertNil(off["trail"], "switched off in the sheet: nothing goes")
    }

    @MainActor
    func testTheChipsCountEachKindInTheSheetsLanguage() {
        XCTAssertEqual(TrailBox.name(.page, 1, Words("en")), "screen")
        XCTAssertEqual(TrailBox.name(.page, 3, Words("en")), "screens")
        XCTAssertEqual(TrailBox.name(.error, 2, Words("fr")), "erreurs")
    }
}

#if os(macOS)
import AppKit

@MainActor
final class ClickTests: XCTestCase {
    private func element(_ role: NSAccessibility.Role, label: String? = nil, title: String? = nil,
                         subrole: NSAccessibility.Subrole? = nil, parent: Any? = nil) -> NSAccessibilityElement {
        let e = NSAccessibilityElement()
        e.setAccessibilityRole(role)
        e.setAccessibilityLabel(label)
        e.setAccessibilityTitle(title)
        e.setAccessibilitySubrole(subrole)
        e.setAccessibilityParent(parent)
        return e
    }

    func testAClickSaysWhatKindOfControlAndItsLabel() {
        XCTAssertEqual(Clicks.describe(element: element(.button, label: "Export"), isPrivate: false), "button \"Export\"")
        XCTAssertEqual(Clicks.describe(element: element(.checkBox, title: "Sync on Wi-Fi only"), isPrivate: false), "checkbox \"Sync on Wi-Fi only\"")
        let long = String(repeating: "a", count: 60)
        XCTAssertEqual(Clicks.describe(element: element(.button, label: long), isPrivate: false)?.count, 49)
    }

    func testTheLabelComesFromTheNearestControlUpTheTree() {
        let button = element(.button, label: "Share")
        let image = element(.unknown, parent: button)
        XCTAssertEqual(Clicks.describe(element: image, isPrivate: false), "button \"Share\"")
        XCTAssertNil(Clicks.describe(element: element(.staticText, label: "A paragraph of someone's note"), isPrivate: false),
                     "text that isn't a control is never recorded")
    }

    func testNeverWhatWasTyped() {
        let field = element(.textField, label: "Card number")
        field.setAccessibilityValue("4111 1111 1111 1111")
        XCTAssertEqual(Clicks.describe(element: field, isPrivate: false), "field \"Card number\"")
        XCTAssertEqual(Clicks.describe(element: element(.textField, label: "Password", subrole: .secureTextField), isPrivate: false), "field")
        XCTAssertEqual(Clicks.describe(element: element(.row, label: "Priya's tax return"), isPrivate: false), "row", "a row's text is the person's content")
    }

    func testPrivateControlsKeepOnlyTheirKind() {
        XCTAssertEqual(Clicks.describe(element: element(.button, label: "Delete Priya's account"), isPrivate: true), "button")
    }

    func testMenuCommandsGiveTheirPath() {
        let main = NSMenu(title: "Main")
        let fileItem = NSMenuItem(title: "File", action: nil, keyEquivalent: "")
        let file = NSMenu(title: "File")
        let export = NSMenuItem(title: "Export…", action: nil, keyEquivalent: "e")
        file.addItem(export)
        fileItem.submenu = file
        main.addItem(fileItem)
        XCTAssertEqual(Clicks.menuPath(export), "menu \"File › Export…\"")
        XCTAssertNil(Clicks.menuPath(NSMenuItem(title: Heresay.shared.words[.menuItem], action: nil, keyEquivalent: "")), "Heresay's own item")
    }
}
#endif

/// No reports, and nothing recorded: `configure` asks for this device's reports in the
/// background, which must not land in another test's `StubProtocol.sent`.
final class NoReports: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"reports":[]}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
final class NudgeTests: XCTestCase {
    private func configured(_ d: UserDefaults = UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!,
                            nudge: HeresayNudge = []) -> Heresay {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [NoReports.self]
        let h = Heresay(defaults: d)
        h.configure(key: "pk", url: URL(string: "https://x.web.app")!, version: "1", accent: nil, trail: [], nudge: nudge, session: URLSession(configuration: c))
        return h
    }

    func testOffDefaultsToNothingAndTheAppCanStillAsk() {
        XCTAssertEqual(configured().nudges, [], "off unless the app turns it on")
        XCTAssertFalse(Heresay(defaults: .standard).offerHelp(.trouble), "not before configure")
        let h = configured()
        XCTAssertTrue(h.offerHelp(.trouble))
        XCTAssertEqual(h.offer, .trouble)
    }

    func testOncePerLaunchAndQuietForSevenDaysAfterNotNow() {
        let d = UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!
        let h = configured(d)
        XCTAssertTrue(h.offerHelp(.trouble))
        h.dropOffer()
        XCTAssertFalse(h.offerHelp(.trouble), "once per launch, even when it went by itself")

        let next = configured(d)
        XCTAssertTrue(next.offerHelp(.trouble), "a new launch may ask again")
        next.answerOffer(false)
        XCTAssertNil(next.offer)
        XCTAssertFalse(configured(d).offerHelp(.trouble), "not for 7 days after Not now")
        XCTAssertTrue(configured(d).offerHelp(.trouble, now: Date().addingTimeInterval(8 * 86_400)))
    }

    func testNotOverTheSheetTheIntroductionOrAHiddenScreen() {
        let h = configured()
        h.present()
        XCTAssertFalse(h.offerHelp(.trouble))
        h.isPresented = false
        h.introPending = true
        XCTAssertFalse(h.offerHelp(.trouble))
        h.introPending = false
        h.setStyle(HeresayStyle(hiddenOnScreens: ["Checkout"]))
        h.setScreen("Checkout")
        XCTAssertFalse(h.offerHelp(.trouble))
        h.setScreen("Cart")
        XCTAssertTrue(h.offerHelp(.trouble))
    }

    func testTellTheTeamOpensTheSheetAsBroken() {
        let h = configured()
        h.offerHelp(.trouble)
        h.answerOffer(true)
        XCTAssertNil(h.offer)
        XCTAssertTrue(h.isPresented)
        XCTAssertEqual(h.draft.type, .broken)

        let without = configured()
        without.setStyle(HeresayStyle(types: [.idea, .confusing]))
        without.offerHelp(.trouble)
        without.answerOffer(true)
        XCTAssertNil(without.draft.type, "only a type the app offers")
    }

    func testALastCrashIsOfferedOnceWhenAsked() {
        let d = UserDefaults(suiteName: "heresay.tests.\(UUID().uuidString)")!
        Trail.keepCrash(d, at: Date().addingTimeInterval(-60), text: "The app crashed: EXC_BAD_ACCESS: SIGSEGV", frames: [])
        let off = configured(d)
        off.crashArrived()
        XCTAssertNil(off.offer, "not without .crash")

        let h = configured(d, nudge: .crash)
        h.crashArrived()
        XCTAssertEqual(h.offer, .crash)
        h.dropOffer()
        let again = configured(d, nudge: .crash)
        again.crashArrived()
        XCTAssertNil(again.offer, "once per crash")
        XCTAssertTrue(again.offerHelp(.trouble), "other trouble still can")
    }

    func testClickWatchSeesADisabledControlPressedAgainAndAgain() {
        var w = ClickWatch()
        let t = Date()
        XCTAssertFalse(w.press(at: t, point: CGPoint(x: 10, y: 10), window: 1, kind: .disabled(7)))
        XCTAssertFalse(w.press(at: t + 3, point: CGPoint(x: 12, y: 11), window: 1, kind: .disabled(7)))
        XCTAssertTrue(w.press(at: t + 6, point: CGPoint(x: 11, y: 9), window: 1, kind: .disabled(7)))
        XCTAssertFalse(w.press(at: t + 7, point: .zero, window: 1, kind: .disabled(7)), "starts counting again")

        var slow = ClickWatch()
        for i in 0..<3 { XCTAssertFalse(slow.press(at: t + Double(i) * 6, point: .zero, window: 1, kind: .disabled(7)), "not 10 s apart") }
    }

    func testClickWatchSeesRapidClicksInOneSpotButNotText() {
        var w = ClickWatch()
        let t = Date()
        for i in 0..<4 { XCTAssertFalse(w.press(at: t + Double(i) * 0.3, point: CGPoint(x: 100, y: 100), window: 1, kind: .other)) }
        XCTAssertTrue(w.press(at: t + 1.2, point: CGPoint(x: 103, y: 98), window: 1, kind: .other))

        var spread = ClickWatch()
        for i in 0..<6 { XCTAssertFalse(spread.press(at: t + Double(i) * 0.2, point: CGPoint(x: Double(i) * 30, y: 0), window: 1, kind: .other), "moving: drawing, not stuck") }
        var text = ClickWatch()
        for i in 0..<6 { XCTAssertFalse(text.press(at: t + Double(i) * 0.1, point: .zero, window: 1, kind: .ignored), "selecting text") }
        var windows = ClickWatch()
        for i in 0..<6 { XCTAssertFalse(windows.press(at: t + Double(i) * 0.1, point: .zero, window: i % 2, kind: .other)) }
    }

    func testEveryLanguageCanOfferHelpInItsOwnWords() {
        for lang in Words.languages where lang != "en" {
            for k in [W.nudgeTitle, .nudgeBody, .nudgeCrashTitle, .nudgeCrashBody, .nudgeYes, .nudgeNo] {
                XCTAssertNotEqual(Words(lang)[k], Words("en")[k], "\(lang) \(k)")
            }
        }
    }
}
