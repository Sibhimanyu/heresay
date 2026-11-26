#if os(macOS)
import AppKit
import SwiftUI
import XCTest
@testable import Heresay

/// Exercises the rendered report content at its fitted size. These checks cover geometry
/// inside the panel; they do not replace testing attachment to a host app's actual sheet.
@MainActor
final class ReportLayoutTests: XCTestCase {
    private struct Panel {
        let host: NSHostingView<ReportSheet>
        let window: NSWindow
        let heresay: Heresay
    }

    private func panel(sheet: HeresayStyle.Sheet, layout: HeresayLayout,
                       language: String = "en", text: String = "", type: ReportType? = nil) -> Panel {
        _ = NSApplication.shared
        let defaults = UserDefaults(suiteName: "heresay.layout.\(UUID().uuidString)")!
        let heresay = Heresay(defaults: defaults)
        heresay.setStyle(HeresayStyle(language: language, sheet: sheet, layout: layout))
        heresay.draft = (type, text)
        let host = NSHostingView(rootView: ReportSheet(heresay: heresay))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 600),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        let fitted = host.fittingSize
        window.setContentSize(fitted)
        window.orderFront(nil)
        host.layoutSubtreeIfNeeded()
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
        host.layoutSubtreeIfNeeded()
        return Panel(host: host, window: window, heresay: heresay)
    }

    private func descendants(_ view: NSView) -> [NSView] {
        [view] + view.subviews.flatMap(descendants)
    }

    private func accessibilityElements(_ object: Any) -> [any NSAccessibilityProtocol] {
        guard let element = object as? any NSAccessibilityProtocol else { return [] }
        return [element] + (element.accessibilityChildren() ?? []).flatMap(accessibilityElements)
    }

    private func renderedAccessibility(_ host: NSView) throws -> [any NSAccessibilityProtocol] {
        let elements = accessibilityElements(host)
        guard elements.contains(where: { $0.accessibilityRole() == .button }) else {
            throw XCTSkip("SwiftUI accessibility controls are unavailable in this test process; containment and Send-state checks remain unverified.")
        }
        return elements
    }

    func testFittedPanelKeepsHeaderActionsAndFooterInsideAcrossSizesAndLanguages() throws {
        for size in [HeresayStyle.Sheet.compact, .regular, .large] {
            for language in Words.languages {
                for layout in [HeresayLayout.composer, .steps] {
                    let p = panel(sheet: size, layout: layout, language: language,
                                  text: "Export did nothing.", type: .improvement)
                    defer { p.window.close() }
                    let elements = try renderedAccessibility(p.host)
                    let words = Words(language)
                    let names = [words[.yourReports], words[.send], words[.cancel], words[.powered]]
                    let visible = p.window.convertToScreen(p.host.convert(p.host.bounds, to: nil))
                        .insetBy(dx: -1, dy: -1)
                    for name in names {
                        let matches = elements.filter {
                            $0.accessibilityLabel() == name || ($0.accessibilityValue() as? String) == name
                                || $0.accessibilityTitle() == name
                        }
                        XCTAssertFalse(matches.isEmpty, "Missing rendered control: \(name), \(language), \(size), \(layout)")
                        for element in matches {
                            let frame = element.accessibilityFrame()
                            XCTAssertGreaterThan(frame.height, 0, "Collapsed control: \(name)")
                            XCTAssertTrue(visible.contains(frame), "Clipped \(name): \(frame) outside \(visible)")
                        }
                    }
                    let editors = descendants(p.host).compactMap { $0 as? NSTextView }
                    XCTAssertEqual(editors.count, 1)
                    if let editor = editors.first, let scroll = editor.enclosingScrollView {
                        let frame = scroll.convert(scroll.bounds, to: p.host)
                        XCTAssertTrue(p.host.bounds.contains(frame), "Editor extends outside the fitted panel")
                    }
                }
            }
        }
    }

    func testRenderedSendStateExplainsMissingCategoryAndText() throws {
        let words = Words("en")
        let cases: [(ReportType?, String, W?, Bool)] = [
            (nil, "Export did nothing.", .pickType, false),
            (.broken, "   ", .whatHappened, false),
            (.broken, "Export did nothing.", nil, true),
        ]
        for (type, text, hint, enabled) in cases {
            let p = panel(sheet: .regular, layout: .composer, text: text, type: type)
            defer { p.window.close() }
            let elements = try renderedAccessibility(p.host)
            func named(_ name: String) -> [any NSAccessibilityProtocol] {
                elements.filter {
                    $0.accessibilityLabel() == name || ($0.accessibilityValue() as? String) == name
                        || $0.accessibilityTitle() == name
                }
            }
            let send = try XCTUnwrap(named(words[.send]).first { $0.accessibilityRole() == .button })
            XCTAssertEqual(send.isAccessibilityEnabled(), enabled)
            if let hint {
                XCTAssertFalse(named(words[hint]).isEmpty, "The missing requirement must be visible")
            } else {
                XCTAssertTrue(named(words[.pickType]).isEmpty)
                XCTAssertTrue(named(words[.whatHappened]).filter { $0.accessibilityRole() == .staticText }.isEmpty)
            }
        }
    }

    func testLongReportScrollsInsideEditorWithoutDisplacingActions() throws {
        let short = panel(sheet: .compact, layout: .composer, text: "A short report", type: .broken)
        defer { short.window.close() }
        let longText = Array(repeating: "The export failed again.", count: 70).joined(separator: "\n")
        let long = panel(sheet: .compact, layout: .composer, text: longText, type: .broken)
        defer { long.window.close() }
        XCTAssertEqual(short.host.bounds.height, long.host.bounds.height, accuracy: 1,
                       "Typing must not grow the panel and push Send or the footer out of view")
        let editor = try XCTUnwrap(descendants(long.host).compactMap { $0 as? NSTextView }.first)
        XCTAssertEqual(editor.string, longText)
        let scroll = try XCTUnwrap(editor.enclosingScrollView)
        let container = try XCTUnwrap(editor.textContainer)
        editor.layoutManager?.ensureLayout(for: container)
        XCTAssertGreaterThan(editor.bounds.height, scroll.contentView.bounds.height,
                             "Long content should scroll inside its own editor")
    }
}
#endif
