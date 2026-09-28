"""Iterations on the 'hi' mark: the dot as a quote, the h cut so the i stands alone."""
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
SW = 34
STEM, ARCH = 'M52 32 V168', 'M52 130 C52 100 72 90 97 90 C124 90 142 106 142 130 V168'
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
CUTS = {
  'none': None,
  'level': 'split:106:148',               # shoulder and leg drawn apart, both rounded
  'slant': ('M108 96 L176 140', 11),     # a diagonal slice through the shoulder
  'wide':  'split:98:158',               # a wider gap: the i stands clearly apart
}
DOTS = {
  'square': lambda a: f'<rect x="125" y="24" width="34" height="34" rx="11" fill="{a}"/>',
  'quote':  lambda a: f'<path d="{Q}" fill="{a}" transform="translate(137 36) scale(1.1)"/>',
  'close':  lambda a: f'<path d="{Q}" fill="{a}" transform="translate(148 36) rotate(180) scale(1.1)"/>',
  'bubble': lambda a: f'<path d="M136 24 H148 A11 11 0 0 1 159 35 V47 A11 11 0 0 1 148 58 H125 V35 A11 11 0 0 1 136 24 Z" fill="{a}"/>',
  'pair':   lambda a: f'<path d="{Q}" fill="{a}" transform="translate(131 40) scale(.62)"/><path d="{Q}" fill="{a}" transform="translate(153 40) scale(.62)"/>',
}
N = [0]
def mark(cut, dot, col, acc):
    N[0] += 1
    letter = (f'<path d="{STEM}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>'
              f'<path d="{ARCH}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>')
    c = CUTS[cut]
    if isinstance(c, str):
        _, end_y, leg_top = c.split(':')
        letter = (f'<path d="{STEM}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>'
                  f'<path d="M52 130 C52 100 72 90 97 90 C120 90 136 {int(end_y)-8} 140 {end_y}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>'
                  f'<path d="M142 {leg_top} V168" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>')
        c = None
    if c:
        mid = f'k{N[0]}'
        letter = (f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="240" height="240"><rect x="-20" y="-20" width="240" height="240" fill="#fff"/>'
                  f'<path d="{c[0]}" stroke="#000" stroke-width="{c[1]}"/></mask><g mask="url(#{mid})">{letter}</g>')
    return letter + DOTS[dot](acc)
V = [
 ('square', 'none', 'Where we started', 'The mark you picked, for reference.'),
 ('square', 'level', 'Cut only', 'A small gap frees the leg, so the i reads on its own.'),
 ('quote', 'none', 'Quote dot only', 'The dot becomes an opening quote: someone is about to speak.'),
 ('quote', 'level', 'Quote + level cut', 'Both changes: the h, a separate i, and a quote for its dot.'),
 ('quote', 'slant', 'Quote + slant cut', 'The slice follows the quote\'s flick, so the two feel drawn together.'),
 ('quote', 'wide', 'Quote + wide cut', 'The i stands clearly apart; "h" and "i" are two letters.'),
 ('close', 'level', 'Closing quote + level cut', 'A closing quote: what was said, and heard.'),
 ('close', 'slant', 'Closing quote + slant cut', 'The quote\'s tail points down at the i it belongs to.'),
 ('bubble', 'level', 'Bubble dot + level cut', 'The dot has one sharp corner: a speech bubble at its smallest.'),
 ('bubble', 'slant', 'Bubble dot + slant cut', 'Sharper and more graphic.'),
 ('pair', 'level', 'Double quote + level cut', 'Two tiny quote marks for the dot: literally quoting the user.'),
 ('square', 'slant', 'Square dot + slant cut', 'Keeps your original dot, adds only the cut.'),
]
COLS, CW, CH, G, P = 4, 400, 470, 24, 60
rows = (len(V) + COLS - 1)//COLS
BW, BH = P*2 + COLS*CW + (COLS-1)*G, P*2 + 120 + rows*CH + (rows-1)*G
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">', f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
     f'<text x="{P}" y="{P+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · "hi" iterations</text>',
     f'<text x="{P}" y="{P+72}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">Two changes, mixed: the dot as a quote (opening, closing, bubble, double) and a cut that frees the i (level, slant, wide). Each: light, app icon, 48 · 32 · 16 px.</text>']
for i, (dot, cut, name, idea) in enumerate(V):
    x, y = P + (i % COLS)*(CW+G), P + 120 + (i//COLS)*(CH+G)
    o.append(f'<g id="hi-{i+1:02d}" transform="translate({x} {y})"><rect width="{CW}" height="{CH}" rx="6" fill="#fff"/>'
             f'<g transform="translate(20 20)"><rect width="172" height="172" rx="6" fill="#f5f6f7"/><g transform="translate(6 6) scale(.8)">{mark(cut, dot, DEEP, ACC)}</g></g>'
             f'<g transform="translate(208 20)"><rect width="172" height="172" rx="38" fill="{DEEP}"/><g transform="translate(26 26) scale(.6)">{mark(cut, dot, W, ACC)}</g></g>'
             f'<g transform="translate(20 212) scale(.24)">{mark(cut, dot, DEEP, ACC)}</g><g transform="translate(80 220) scale(.16)">{mark(cut, dot, DEEP, ACC)}</g>'
             f'<g transform="translate(122 228) scale(.08)">{mark(cut, dot, DEEP, ACC)}</g>'
             f'<rect x="160" y="212" width="48" height="48" rx="11" fill="{DEEP}"/><g transform="translate(166 218) scale(.18)">{mark(cut, dot, W, ACC)}</g>'
             f'<rect x="220" y="224" width="24" height="24" rx="6" fill="{DEEP}"/><g transform="translate(223 227) scale(.09)">{mark(cut, dot, W, ACC)}</g>'
             f'<text x="20" y="300" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">{i+1:02d}</text>'
             f'<text x="50" y="300" font-family="Helvetica, Arial, sans-serif" font-size="21" font-weight="700" fill="{INK}">{name}</text>'
             f'<foreignObject x="20" y="314" width="{CW-40}" height="80"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px/1.45 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject>'
             f'<g transform="translate(20 398)"><g transform="scale(.3)">{mark(cut, dot, DEEP, ACC)}</g>'
             f'<text x="70" y="46" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="40" letter-spacing="-1.5" fill="{DEEP}">heresay</text></g></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-hi.svg', 'w').write(svg)
open('docs/brand/heresay-logo-hi.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · hi iterations</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
