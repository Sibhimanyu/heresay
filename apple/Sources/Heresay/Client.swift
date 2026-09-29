import Foundation

/// The two public calls, the same ones the web SDK makes. Sendable so it can run off the main actor.
struct Client: Sendable {
    let base: URL
    let key: String
    let session: URLSession

    struct Failure: Error, LocalizedError, Equatable {
        let status: Int
        let message: String
        var errorDescription: String? { message }
    }

    private struct SubmitBody: Encodable {
        let key: String
        let device_id: String
        let type: ReportType
        let text: String
        let context: ReportContext
    }

    private struct MineBody: Encodable {
        let key: String
        let device_id: String
    }

    private struct ReportEnvelope: Decodable { let report: SentReport }
    private struct ReportsEnvelope: Decodable { let reports: [SentReport] }
    private struct ErrorEnvelope: Decodable { let error: String? }

    func submit(deviceId: String, type: ReportType, text: String, context: ReportContext) async throws -> SentReport {
        let body = SubmitBody(key: key, device_id: deviceId, type: type, text: text, context: context)
        return try await post("reports", body, as: ReportEnvelope.self).report
    }

    func mine(deviceId: String) async throws -> [SentReport] {
        try await post("reports/mine", MineBody(key: key, device_id: deviceId), as: ReportsEnvelope.self).reports
    }

    private func post<B: Encodable, R: Decodable>(_ path: String, _ body: B, as: R.Type) async throws -> R {
        var req = URLRequest(url: base.appending(path: "v1/\(path)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 20
        req.httpBody = try JSONEncoder().encode(body)
        let (data, res) = try await session.data(for: req)
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ErrorEnvelope.self, from: data))?.error
            throw Failure(status: status, message: Self.explain(status, message))
        }
        return try JSONDecoder().decode(R.self, from: data)
    }

    /// The server's words when it has them; plain ones otherwise.
    static func explain(_ status: Int, _ message: String?) -> String {
        if status == 429 { return "Too many reports from this device. Try again a little later." }
        if let m = message, !m.isEmpty { return m.prefix(1).uppercased() + m.dropFirst() + "." }
        return status == 0 ? "Couldn’t reach the server. Check your connection." : "Something went wrong (\(status))."
    }
}
