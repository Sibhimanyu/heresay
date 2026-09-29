"""Heresay abstract marks: 1-2 primitives each, meaning from their relationship. Writes docs/brand/heresay-logo-abstract.{svg,html}."""
import math
P, INK, W = '#0f766e', '#15171c', '#ffffff'
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
def drop(cx, cy, r, corner_deg, fill):
    """A circle with one square corner: a speech bubble reduced to its minimum."""
    return (f'<path d="M{cx} {cy-r} A{r} {r} 0 1 1 {cx-r} {cy} L{cx-r} {cy-r} Z" fill="{fill}" '
            f'transform="rotate({corner_deg} {cx} {cy})"/>')
def ring_gap(cx, cy, r, a0, a1, sw, col):
    x0, y0 = cx + r*math.cos(math.radians(a0)), cy + r*math.sin(math.radians(a0))
    x1, y1 = cx + r*math.cos(math.radians(a1)), cy + r*math.sin(math.radians(a1))
    return f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 1 1 {x1:.1f} {y1:.1f}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round"/>'
M = [
 ('Said / heard', 'One solid, one open. What was said, and the space that received it.',
  f'<circle cx="78" cy="100" r="44" fill="{P}"/><circle cx="122" cy="100" r="44" fill="none" stroke="{INK}" stroke-width="12"/>'),
 ('Echo', 'A shape and its reply, a step behind. Every report comes back.',
  f'<circle cx="112" cy="100" r="52" fill="none" stroke="{P}" stroke-width="7"/><circle cx="88" cy="100" r="52" fill="{P}"/>'),
 ('Dot and arc', 'A voice, and one curve turned toward it. Someone is listening.',
  f'<circle cx="68" cy="100" r="24" fill="{P}"/><path d="M118 46 A58 58 0 0 1 118 154" fill="none" stroke="{INK}" stroke-width="18" stroke-linecap="round"/>'),
 ('Split', 'Half spoken, half heard. Neither is whole without the other.',
  f'<path d="M94 40 A60 60 0 0 0 94 160 Z" fill="{P}"/><path d="M110 46 A54 54 0 0 1 110 154" fill="none" stroke="{INK}" stroke-width="12"/>'),
 ('Round trip', 'One line that goes out and comes back, carrying the answer.',
  f'<path d="M62 44 V108 A38 38 0 0 0 138 108 V76" fill="none" stroke="{P}" stroke-width="22" stroke-linecap="round"/><circle cx="138" cy="48" r="12" fill="{INK}"/>'),
 ('Here', 'A frame around one point: this is the place, say it here.',
  f'<path d="M48 92 V48 H92 M152 108 V152 H108" fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="100" r="18" fill="{P}"/>'),
 ('Common ground', 'Two people, and the shape their conversation makes between them.',
  f'<path d="M100 48 A60 60 0 0 1 100 152 A60 60 0 0 1 100 48 Z" fill="{P}"/><circle cx="36" cy="100" r="11" fill="{INK}"/><circle cx="164" cy="100" r="11" fill="{INK}"/>'),
 ('One sharp corner', 'A soft square with a single point: a speech bubble, reduced to nothing but its tail.',
  f'<path d="M90 40 H110 A50 50 0 0 1 160 90 V110 A50 50 0 0 1 110 160 H40 V90 A50 50 0 0 1 90 40 Z" fill="{P}"/>'),
 ('The drop', 'A circle with one square corner: the smallest possible thing said.',
  drop(100, 100, 60, -90, P)),
 ('Two drops', 'Two voices turned toward each other, corners meeting.',
  drop(76, 88, 42, 180, P) + drop(124, 112, 42, 0, INK)),
 ('Turns', 'Two bars, one a step lower: taking turns. Together they suggest an H.',
  f'<rect x="54" y="40" width="36" height="96" rx="18" fill="{P}"/><rect x="110" y="64" width="36" height="96" rx="18" fill="{INK}"/>'),
 ('Let in', 'A ring with one voice entering it.',
  f'<circle cx="112" cy="100" r="52" fill="none" stroke="{P}" stroke-width="14"/><circle cx="60" cy="100" r="18" fill="{INK}"/>'),
 ('Feather eye, reduced', 'The peacock feather\'s eye in two shapes: being seen.',
  f'<path d="M100 26 C144 58 152 112 100 174 C48 112 56 58 100 26 Z" fill="{P}"/><circle cx="100" cy="114" r="20" fill="{INK}"/>'),
 ('The comma', 'The quote mark at its minimum: a pause, then someone speaks.',
  f'<path d="{Q}" fill="{P}" transform="translate(104 116) scale(2.3)"/>'),
 ('Two halves', 'Two half circles, slightly out of step: a conversation completing.',
  f'<path d="M30 96 A60 60 0 0 1 150 96 Z" fill="{P}"/><path d="M50 104 A60 60 0 0 0 170 104 Z" fill="{INK}"/>'),
 ('Room for one', 'An open ring that leaves a gap, and the voice that fills it.',
  ring_gap(100, 100, 56, 172, 98, 14, INK) + f'<circle cx="{100+56*math.cos(math.radians(135)):.1f}" cy="{100+56*math.sin(math.radians(135)):.1f}" r="16" fill="{P}"/>'),
]
COLS, CW, CH, GAP, PAD = 4, 380, 400, 24, 60
rows = math.ceil(len(M)/COLS)
BW, BH = PAD*2 + COLS*CW + (COLS-1)*GAP, PAD*2 + 150 + rows*CH + (rows-1)*GAP
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">', f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
     f'<text x="{PAD}" y="{PAD+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · abstract marks</text>',
     f'<text x="{PAD}" y="{PAD+72}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">Rules: at most two shapes · no drawn objects · meaning comes from how the shapes relate · must read at 16px</text>',
     f'<text x="{PAD}" y="{PAD+100}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">Each card: the mark, then the same mark at 32px and 16px on light and dark.</text>']
for i, (name, idea, art) in enumerate(M):
    c, r = i % COLS, i // COLS
    x, y = PAD + c*(CW+GAP), PAD + 150 + r*(CH+GAP)
    small = (f'<g transform="translate(24 238) scale(.16)">{art}</g><g transform="translate(64 246) scale(.08)">{art}</g>'
             f'<rect x="96" y="232" width="96" height="44" rx="6" fill="#16181d"/>'
             f'<g transform="translate(104 238) scale(.16)">{art.replace(INK, "#eceef1").replace(P, "#2dd4bf")}</g>'
             f'<g transform="translate(144 246) scale(.08)">{art.replace(INK, "#eceef1").replace(P, "#2dd4bf")}</g>')
    o.append(f'<g id="mark-{i+1:02d}" transform="translate({x} {y})"><rect width="{CW}" height="{CH}" rx="6" fill="#fff"/>'
             f'<g transform="translate({CW/2-90} 22) scale(.9)">{art}</g>{small}'
             f'<text x="24" y="312" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="{P}">{i+1:02d}</text>'
             f'<text x="52" y="312" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="{INK}">{name}</text>'
             f'<foreignObject x="24" y="324" width="{CW-48}" height="70"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px/1.45 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-abstract.svg', 'w').write(svg)
open('docs/brand/heresay-logo-abstract.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · abstract marks</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
print(len(M))
