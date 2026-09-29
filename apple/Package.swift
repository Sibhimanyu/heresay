// swift-tools-version: 6.0
// Heresay for Apple platforms: a Report button and sheet for SwiftUI apps on iOS and macOS,
// talking to the same /v1 API as the web SDK.
import PackageDescription

let package = Package(
    name: "Heresay",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "Heresay", targets: ["Heresay"]),
    ],
    targets: [
        .target(name: "Heresay"),
        .testTarget(name: "HeresayTests", dependencies: ["Heresay"]),
    ]
)
