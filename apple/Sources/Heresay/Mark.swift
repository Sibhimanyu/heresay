import SwiftUI

/// The Heresay mark: a soft wave with quote-mark eyes, drawn from the brand SVG
/// (`brand/svg/heresay-mark.svg`, 200×200). The eyes are holes, so it takes any fill: peacock on
/// white, or white on the peacock button.
public struct HeresayMark: Shape {
    public init() {}

    public func path(in rect: CGRect) -> Path { Self.path(in: rect) }

    /// The mark with its eyes moved by (dx, dy) and squashed to `open` of their height (1 is open).
    static func path(in rect: CGRect, dx: CGFloat = 0, dy: CGFloat = 0, open: CGFloat = 1) -> Path {
        var p = Path()
        p.addLines(Self.outline.map { CGPoint(x: $0.0, y: $0.1) })
        p.closeSubpath()
        for (x, y) in [(CGFloat(80), CGFloat(106)), (124, 101)] {
            // Blink about the eye's own centre, then glance.
            let pose = CGAffineTransform(translationX: -x, y: -y).concatenating(CGAffineTransform(scaleX: 1, y: open))
                .concatenating(CGAffineTransform(translationX: x + dx, y: y + dy))
            p.addPath(Self.eye, transform: Self.eyeAt(x: x, y: y).concatenating(pose))
        }
        let side = min(rect.width, rect.height)
        return p.applying(CGAffineTransform(translationX: rect.midX - side / 2, y: rect.midY - side / 2)
            .scaledBy(x: side / 200, y: side / 200))
    }

    /// One eye, a quote mark: a round head with a tail sweeping up and right.
    private static let eye: Path = {
        var e = Path()
        e.move(to: CGPoint(x: -13, y: 12))
        e.addCurve(to: CGPoint(x: 17, y: -32), control1: CGPoint(x: -13, y: -8), control2: CGPoint(x: -2, y: -24))
        e.addLine(to: CGPoint(x: 20, y: -25))
        e.addCurve(to: CGPoint(x: 3, y: -1), control1: CGPoint(x: 8, y: -18), control2: CGPoint(x: 2, y: -9))
        // SVG "A13 13 0 1 1 -13 12", as a centre and angles.
        e.addArc(center: CGPoint(x: -0.004767, y: 11.647979), radius: 13,
                 startAngle: .degrees(-76.636), endAngle: .degrees(178.448), clockwise: false)
        e.closeSubpath()
        return e
    }()

    private static func eyeAt(x: CGFloat, y: CGFloat) -> CGAffineTransform {
        CGAffineTransform(translationX: x, y: y).rotated(by: -24 * .pi / 180).scaledBy(x: 1.25, y: 1.25)
    }

    private static let outline: [(CGFloat, CGFloat)] = [
        (174, 100), (175.38, 101.97), (176.68, 104.02), (177.85, 106.13), (178.86, 108.29), (179.68, 110.49),
        (180.28, 112.72), (180.65, 114.95), (180.76, 117.17), (180.6, 119.35), (180.17, 121.48), (179.48, 123.54),
        (178.52, 125.51), (177.31, 127.38), (175.88, 129.13), (174.25, 130.75), (172.44, 132.25), (170.48, 133.62),
        (168.41, 134.86), (166.27, 135.98), (164.09, 137), (161.89, 137.93), (159.73, 138.79), (157.62, 139.6),
        (155.59, 140.39), (153.66, 141.17), (151.85, 141.99), (150.17, 142.85), (148.63, 143.79), (147.23, 144.82),
        (145.96, 145.96), (144.82, 147.23), (143.79, 148.63), (142.85, 150.17), (141.99, 151.85), (141.17, 153.66),
        (140.39, 155.59), (139.6, 157.62), (138.79, 159.73), (137.93, 161.89), (137, 164.09), (135.98, 166.27),
        (134.86, 168.41), (133.62, 170.48), (132.25, 172.44), (130.75, 174.25), (129.13, 175.88), (127.38, 177.31),
        (125.51, 178.52), (123.54, 179.48), (121.48, 180.17), (119.35, 180.6), (117.17, 180.76), (114.95, 180.65),
        (112.72, 180.28), (110.49, 179.68), (108.29, 178.86), (106.13, 177.85), (104.02, 176.68), (101.97, 175.38),
        (100, 174), (98.1, 172.57), (96.27, 171.12), (94.51, 169.7), (92.82, 168.33), (91.17, 167.06),
        (89.56, 165.9), (87.98, 164.88), (86.39, 164.01), (84.8, 163.31), (83.18, 162.79), (81.51, 162.43),
        (79.78, 162.24), (77.98, 162.2), (76.09, 162.29), (74.12, 162.49), (72.05, 162.77), (69.9, 163.1),
        (67.67, 163.46), (65.36, 163.8), (63, 164.09), (60.6, 164.3), (58.18, 164.39), (55.77, 164.35),
        (53.39, 164.15), (51.08, 163.76), (48.85, 163.17), (46.73, 162.37), (44.76, 161.35), (42.94, 160.13),
        (41.31, 158.69), (39.87, 157.06), (38.65, 155.24), (37.63, 153.27), (36.83, 151.15), (36.24, 148.92),
        (35.85, 146.61), (35.65, 144.23), (35.61, 141.82), (35.7, 139.4), (35.91, 137), (36.2, 134.64),
        (36.54, 132.33), (36.9, 130.1), (37.23, 127.95), (37.51, 125.88), (37.71, 123.91), (37.8, 122.02),
        (37.76, 120.22), (37.57, 118.49), (37.21, 116.82), (36.69, 115.2), (35.99, 113.61), (35.12, 112.02),
        (34.1, 110.44), (32.94, 108.83), (31.67, 107.18), (30.3, 105.49), (28.88, 103.73), (27.43, 101.9),
        (26, 100), (24.62, 98.03), (23.32, 95.98), (22.15, 93.87), (21.14, 91.71), (20.32, 89.51),
        (19.72, 87.28), (19.35, 85.05), (19.24, 82.83), (19.4, 80.65), (19.83, 78.52), (20.52, 76.46),
        (21.48, 74.49), (22.69, 72.62), (24.12, 70.87), (25.75, 69.25), (27.56, 67.75), (29.52, 66.38),
        (31.59, 65.14), (33.73, 64.02), (35.91, 63), (38.11, 62.07), (40.27, 61.21), (42.38, 60.4),
        (44.41, 59.61), (46.34, 58.83), (48.15, 58.01), (49.83, 57.15), (51.37, 56.21), (52.77, 55.18),
        (54.04, 54.04), (55.18, 52.77), (56.21, 51.37), (57.15, 49.83), (58.01, 48.15), (58.83, 46.34),
        (59.61, 44.41), (60.4, 42.38), (61.21, 40.27), (62.07, 38.11), (63, 35.91), (64.02, 33.73),
        (65.14, 31.59), (66.38, 29.52), (67.75, 27.56), (69.25, 25.75), (70.87, 24.12), (72.62, 22.69),
        (74.49, 21.48), (76.46, 20.52), (78.52, 19.83), (80.65, 19.4), (82.83, 19.24), (85.05, 19.35),
        (87.28, 19.72), (89.51, 20.32), (91.71, 21.14), (93.87, 22.15), (95.98, 23.32), (98.03, 24.62),
        (100, 26), (101.9, 27.43), (103.73, 28.88), (105.49, 30.3), (107.18, 31.67), (108.83, 32.94),
        (110.44, 34.1), (112.02, 35.12), (113.61, 35.99), (115.2, 36.69), (116.82, 37.21), (118.49, 37.57),
        (120.22, 37.76), (122.02, 37.8), (123.91, 37.71), (125.88, 37.51), (127.95, 37.23), (130.1, 36.9),
        (132.33, 36.54), (134.64, 36.2), (137, 35.91), (139.4, 35.7), (141.82, 35.61), (144.23, 35.65),
        (146.61, 35.85), (148.92, 36.24), (151.15, 36.83), (153.27, 37.63), (155.24, 38.65), (157.06, 39.87),
        (158.69, 41.31), (160.13, 42.94), (161.35, 44.76), (162.37, 46.73), (163.17, 48.85), (163.76, 51.08),
        (164.15, 53.39), (164.35, 55.77), (164.39, 58.18), (164.3, 60.6), (164.09, 63), (163.8, 65.36),
        (163.46, 67.67), (163.1, 69.9), (162.77, 72.05), (162.49, 74.12), (162.29, 76.09), (162.2, 77.98),
        (162.24, 79.78), (162.43, 81.51), (162.79, 83.18), (163.31, 84.8), (164.01, 86.39), (164.88, 87.98),
        (165.9, 89.56), (167.06, 91.17), (168.33, 92.82), (169.7, 94.51), (171.12, 96.27), (172.57, 98.1),
    ]
}

extension HeresayMark {
    /// Filled with the eyes cut out.
    static func filled(_ color: Color) -> some View {
        HeresayMark().fill(color, style: FillStyle(eoFill: true))
    }
}

/// The loader: the mark's eyes look left, look right, then blink. Same motion as the web widget and
/// `brand/svg/loaders/heresay-loader-glance.svg`. Holds still under Reduce Motion.
public struct HeresayGlance: View {
    var color: Color
    var period: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ color: Color, period: Double = 1.6) {
        self.color = color
        self.period = period
    }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { ctx in
            let t = reduceMotion ? 0 : ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
            Pose(phase: t).fill(color, style: FillStyle(eoFill: true))
        }
        .accessibilityHidden(true)
    }

    private struct Pose: Shape {
        let phase: Double
        func path(in rect: CGRect) -> Path {
            let (dx, dy) = Self.look(phase)
            return HeresayMark.path(in: rect, dx: dx, dy: dy, open: Self.blink(phase))
        }
        /// Rest, look left, look right, rest; eased between holds.
        static func look(_ t: Double) -> (CGFloat, CGFloat) {
            let keys: [(Double, CGFloat, CGFloat)] = [(0, 0, 0), (0.10, 0, 0), (0.25, -9, 1), (0.40, -9, 1),
                                                     (0.55, 9, -1), (0.70, 9, -1), (0.85, 0, 0), (1, 0, 0)]
            for i in 1..<keys.count where t <= keys[i].0 {
                let (t0, x0, y0) = keys[i - 1], (t1, x1, y1) = keys[i]
                let u = CGFloat((t - t0) / (t1 - t0)), e = u * u * (3 - 2 * u)
                return (x0 + (x1 - x0) * e, y0 + (y1 - y0) * e)
            }
            return (0, 0)
        }
        static func blink(_ t: Double) -> CGFloat {
            let d = abs(t - 0.92)
            return d >= 0.04 ? 1 : 0.1 + 0.9 * CGFloat(d / 0.04)
        }
    }
}
