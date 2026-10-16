import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// The trail, written to disk as it happens, so it outlives a crash: the next launch can send what
/// happened before the app closed, and say whether it was the first launch after an update. On
/// the device only, already cleaned like everything in the trail; it leaves only with a report,
/// and is forgotten after a day.
///
/// A run that never said it ended (going to the background on iOS, quitting on macOS) ended
/// badly: a crash, a hang the system killed, running out of memory, or a force quit.
final class BlackBox: @unchecked Sendable {
    struct Run: Codable, Equatable {
        var launchedAt: Date
        var version: String?
        /// Set when this was the first launch of `version`: the one before it, if any.
        var previousVersion: String?
        var firstOfVersion: Bool
        /// The last time anything was written: as near as Heresay gets to when it ended.
        var savedAt: Date
        var clean: Bool
        var entries: [Trail.Entry] = []
        /// The app's own logged errors, read every so often while it runs (`readLog`).
        var logs: [Trail.Entry] = []
    }

    static let keep: TimeInterval = 86_400
    static let maxLogs = 30

    private let current: URL
    private let last: URL
    private let queue = DispatchQueue(label: "dev.heresay.blackbox", qos: .utility)
    private let lock = NSLock()
    private var run: Run?
    private var writeScheduled = false
    private var observers: [NSObjectProtocol] = []
    private var heartbeat: DispatchSourceTimer?
    /// How often the run says it's still going, so "closed 75 s after launch" is right to within it.
    static let beat: TimeInterval = 10

    init(dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        current = dir.appendingPathComponent("run.json")
        last = dir.appendingPathComponent("last-run.json")
    }

    /// Application Support, in a folder of the app's own (Mac apps outside the sandbox share it).
    static func defaultDir() -> URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let app = Bundle.main.bundleIdentifier ?? ProcessInfo.processInfo.processName
        return base.appendingPathComponent(app, isDirectory: true).appendingPathComponent("Heresay", isDirectory: true)
    }

    // MARK: Runs

    /// At launch: if the run before this one ended badly, keep it as the last run. Then start this
    /// one. Returns the run that ended badly, when there was one.
    @discardableResult
    func begin(version: String?, defaults: UserDefaults, now: Date = Date()) -> Run? {
        var found: Run?
        if let prev = read(current), !prev.clean, now.timeIntervalSince(prev.savedAt) < Self.keep {
            found = prev
            write(prev, to: last)
        }
        let seen = defaults.string(forKey: Self.versionKey)
        let first = version != nil && seen != version
        if let version { defaults.set(version, forKey: Self.versionKey) }
        let r = Run(launchedAt: now, version: version, previousVersion: first ? seen : nil, firstOfVersion: first,
                    savedAt: now, clean: false)
        lock.withLock { run = r }
        write(r, to: current)
        watchLifecycle()
        startHeartbeat()
        return found
    }

    static let versionKey = "heresay.last_version"

    /// The trail changed: written within a second, a few changes at a time.
    func update(_ entries: [Trail.Entry], now: Date = Date()) {
        lock.withLock {
            run?.entries = Array(entries.suffix(Trail.maxEvents))
            run?.savedAt = now
            guard !writeScheduled else { return }
            writeScheduled = true
            queue.asyncAfter(deadline: .now() + 1) { [weak self] in self?.flush() }
        }
    }

    /// The app's own logged errors since the last look, kept with the run.
    func addLogs(_ logs: [Trail.Entry], now: Date = Date()) {
        guard !logs.isEmpty else { return }
        lock.withLock {
            guard var r = run else { return }
            let cut = now.addingTimeInterval(-Trail.maxAge)
            r.logs = Array((r.logs + logs).filter { $0.at >= cut }.suffix(Self.maxLogs))
            r.savedAt = now
            run = r
        }
        flush()
    }

    /// When the log was last read, so the next look starts there.
    var lastLogAt: Date? { lock.withLock { run?.logs.last?.at } }

    /// One look at the app's own log, at background priority: its errors since the last look go
    /// with the run. Returns how long the look took, in seconds.
    @discardableResult
    func readLog(every: TimeInterval) async -> TimeInterval {
        let since = lastLogAt.map { $0.addingTimeInterval(0.001) } ?? Date().addingTimeInterval(-every)
        return await Task.detached(priority: .background) { [self] in
            let t0 = Date()
            addLogs(Trail.logErrors(since: since))
            return Date().timeIntervalSince(t0)
        }.value
    }

    /// It ended well (or is about to be suspended, which isn't a crash), or it is running again.
    func markClean(_ clean: Bool, now: Date = Date()) {
        lock.withLock { run?.clean = clean; run?.savedAt = now }
        flush(sync: true)
    }

    /// Write now and wait: for tests, and for the moments the app is about to stop.
    func flushNow() { flush(sync: true) }

    private func flush(sync: Bool = false) {
        let r: Run? = lock.withLock { writeScheduled = false; return run }
        guard let r else { return }
        if sync { queue.sync { write(r, to: current) } } else { queue.async { [self] in write(r, to: current) } }
    }

    // MARK: The last run

    /// The run that ended badly, while it's under a day old.
    func lastRun(now: Date = Date()) -> Run? {
        guard let r = read(last), now.timeIntervalSince(r.savedAt) < Self.keep else { return nil }
        return r
    }

    func forgetLastRun() { try? FileManager.default.removeItem(at: last) }

    /// What the last run leaves for a report: its last five minutes, timed back from when it
    /// ended, and a line saying how it ended. Nothing when there is no last run.
    func lastRunEntries(now: Date = Date()) -> [Trail.Entry] {
        guard let r = lastRun(now: now) else { return [] }
        let cut = r.savedAt.addingTimeInterval(-Trail.maxAge)
        var out = (r.entries + r.logs).filter { $0.at >= cut }.sorted { $0.at < $1.at }.suffix(Trail.maxEvents - 1).map { e in
            var e = e
            e.beforeEnd = max(0, Int(r.savedAt.timeIntervalSince(e.at).rounded()))
            return e
        }
        out.append(Trail.Entry(kind: .error, at: r.savedAt, text: Self.ending(r), beforeEnd: 0))
        return out
    }

    /// "The app closed unexpectedly 4 s after launch, on the first launch after updating from 1.3 to 1.4"
    static func ending(_ r: Run) -> String {
        let s = max(0, Int(r.savedAt.timeIntervalSince(r.launchedAt).rounded()))
        let after = s < 60 ? "\(s) s" : s < 3600 ? "\(s / 60) min" : "\(s / 3600) h"
        var line = "The app closed unexpectedly \(after) after launch"
        if r.firstOfVersion, let prev = r.previousVersion, let v = r.version {
            line += ", on the first launch after updating from \(prev) to \(v)"
        } else if r.firstOfVersion, let v = r.version {
            line += ", on the first launch of \(v)"
        } else if let v = r.version {
            line += " (version \(v))"
        }
        return line
    }

    // MARK: Files

    private func read(_ url: URL) -> Run? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .secondsSince1970
        return try? d.decode(Run.self, from: data)
    }

    private func write(_ r: Run, to url: URL) {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .secondsSince1970
        guard let data = try? e.encode(r) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// A tiny write every ten seconds while the app runs: when it stops, that is when it ended.
    private func startHeartbeat() {
        heartbeat?.cancel()
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now() + Self.beat, repeating: Self.beat, leeway: .seconds(2))
        t.setEventHandler { [weak self] in
            guard let self else { return }
            let r: Run? = self.lock.withLock { self.run?.savedAt = Date(); return self.run }
            if let r, !r.clean { self.write(r, to: self.current) }
        }
        t.resume()
        heartbeat = t
    }

    // MARK: Ending well

    private func watchLifecycle() {
        guard observers.isEmpty else { return }
        let nc = NotificationCenter.default
        weak let box = self
        let mark: (Bool) -> @Sendable (Notification) -> Void = { clean in { _ in box?.markClean(clean) } }
        #if os(macOS)
        observers.append(nc.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil, using: mark(true)))
        #else
        // Suspended in the background is how iOS apps end; being killed there isn't a crash.
        observers.append(nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil, using: mark(true)))
        observers.append(nc.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil, using: mark(false)))
        observers.append(nc.addObserver(forName: UIApplication.willTerminateNotification, object: nil, queue: nil, using: mark(true)))
        #endif
    }

    deinit {
        heartbeat?.cancel()
        for o in observers { NotificationCenter.default.removeObserver(o) }
    }
}
