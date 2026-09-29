"""The Heresay mark and wordmark, as exact geometry. Everything else imports from here."""
import math
DEEP, PEACOCK, ACC, SOFT, INK, SLATE, LINE, PAPER, W = '#0b5e57', '#0f766e', '#2dd4bf', '#e6f4f2', '#15171c', '#5b6472', '#e3e6ea', '#f5f6f7', '#ffffff'
# Construction, in a 200-unit box: a circle of radius R, six waves of depth A, two quote-mark eyes.
R, A, N = 74, 9, 6
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
EYES = [(80, 106), (124, 101)]; EYE_SCALE, EYE_TILT = 1.25, -24
def body():
    pts = []
    for i in range(720):
        t = 2*math.pi*i/720; r = R + A*math.sin(N*t)
        pts.append(f'{100+r*math.cos(t):.2f} {100+r*math.sin(t):.2f}')
    return 'M' + ' L'.join(pts) + 'Z'
BODY = body()
def eyes(fill): return ''.join(f'<path d="{Q}" fill="{fill}" transform="translate({x} {y}) rotate({EYE_TILT}) scale({EYE_SCALE})"/>' for x, y in EYES)
def mark(body_fill=DEEP, eye_fill=W): return f'<path d="{BODY}" fill="{body_fill}"/>' + eyes(eye_fill)

# Wordmark: "heresay" in Bricolage Grotesque ExtraBold, as outlines.
FONT = '/tmp/fonts/bricolage-800.ttf'
def wordmark_path(text='heresay', tracking=-18):
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    f = TTFont(FONT); gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f['hmtx']
    x, out = 0, []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))   # flip y: font units grow upward
        out.append(pen.getCommands())
        x += hmtx[g][0] + tracking
    asc = max(v for v in [f['OS/2'].sCapHeight or 700, 720])
    return ' '.join(out), x - tracking, f['OS/2'].sxHeight, f['hhea'].ascent
WM, WM_W, XH, ASC = (None,)*4
def load_wordmark():
    global WM, WM_W, XH, ASC
    if WM is None: WM, WM_W, XH, ASC = wordmark_path()
    return WM, WM_W, XH
def wordmark(fill, height):
    """Wordmark scaled so the h's ascender is `height` tall; baseline at y=height."""
    p, w, xh = load_wordmark()
    s = height / 760
    return f'<g transform="translate(0 {height}) scale({s:.5f})"><path d="{p}" fill="{fill}"/></g>', w*s
def lockup(mark_fill=DEEP, eye_fill=W, word_fill=DEEP, size=200):
    """Horizontal lockup. The mark is `size` tall; the wordmark ascender is 0.5 of it; gap is 0.18 of it."""
    wh = size*0.5; wm, ww = wordmark(word_fill, wh)
    gap = size*0.18
    y = (size - wh)/2 + wh*0.08
    svg = f'<g transform="scale({size/200})">{mark(mark_fill, eye_fill)}</g><g transform="translate({size+gap} {y})">{wm}</g>'
    return svg, size + gap + ww, size
