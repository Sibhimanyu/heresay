"""Heresay letter marks in the user's house style (Greenroom, Imago): one heavy stroke, a hidden second reading, one bright accent piece."""
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
SW = 34
def stroke(d, col): return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>'
STEM, ARCH = 'M52 32 V168', 'M52 130 C52 100 72 90 97 90 C124 90 142 106 142 130 V168'
M = [
 ('hi', 'The h\'s second leg, with the accent dot above it, is an i. It reads "hi", and a person standing inside the letter, ready to listen.',
  lambda c, a: stroke(STEM, c) + stroke(ARCH, c) + f'<rect x="125" y="24" width="34" height="34" rx="11" fill="{a}"/>'),
 ('The speaking h', 'The right leg ends in a sharp bubble corner. The counter is the bubble, and the dot is what was said.',
  lambda c, a: stroke(STEM, c) + stroke('M52 130 C52 100 72 90 97 90 C124 90 142 106 142 130 V150', c)
             + f'<path d="M125 140 H159 V185 L125 168 Z" fill="{c}"/><circle cx="97" cy="146" r="14" fill="{a}"/>'),
 ('The listening h', 'The shoulder curls in like an ear, turned toward the voice.',
  lambda c, a: stroke(STEM, c) + stroke('M52 130 C52 98 74 84 100 84 C128 84 146 102 146 126 C146 148 130 154 118 164', c)
             + f'<circle cx="182" cy="112" r="14" fill="{a}"/>'),
 ('Quote h', 'The h\'s shoulder is a quote mark. The drop at its end, in the accent, is what was said.',
  lambda c, a: stroke(STEM, c) + stroke('M52 116 C58 90 84 80 108 86', c) + f'<circle cx="128" cy="130" r="36" fill="{a}"/>'
             + f'<path d="M104 70 C130 76 150 96 156 124" fill="none" stroke="{c}" stroke-width="{SW}" stroke-linecap="round"/>'),
 ('Window H', 'A heavy bubble with an H cut through it. The crossbar, in the accent, is the connection between you and your user.',
  lambda c, a: f'<path d="M78 24 H122 A48 48 0 0 1 170 72 V128 A48 48 0 0 1 122 176 H30 V72 A48 48 0 0 1 78 24 Z" fill="{c}"/>'
             + f'<rect x="84" y="42" width="32" height="46" rx="12" fill="{W if c == DEEP else DEEP}"/><rect x="84" y="112" width="32" height="46" rx="12" fill="{W if c == DEEP else DEEP}"/>'
             + f'<rect x="84" y="88" width="32" height="24" fill="{a}"/>'),
 ('hs, one stroke', 'here flows into say: the h\'s leg turns into an s without lifting the pen.',
  lambda c, a: stroke(STEM, c) + stroke('M52 132 C52 102 70 92 94 92 C118 92 132 106 132 124 C132 142 110 146 106 160 C102 176 130 180 158 168', c)
             + f'<circle cx="160" cy="100" r="14" fill="{a}"/>'),
]
def card(i, name, idea, f):
    art = f(DEEP, ACC); rev = f(W, ACC)
    return (f'<g id="mark-{i+1:02d}" transform="translate({60 + (i % 3)*560} {250 + (i//3)*520})">'
            f'<rect width="536" height="496" rx="6" fill="#fff"/>'
            f'<g transform="translate(24 24)"><rect width="236" height="236" rx="6" fill="#f5f6f7"/><g transform="translate(18 18)">{art}</g></g>'
            f'<g transform="translate(276 24)"><rect width="236" height="236" rx="52" fill="{DEEP}"/><g transform="translate(38 38) scale(.8)">{rev}</g></g>'
            f'<g transform="translate(24 280) scale(.24)">{art}</g><g transform="translate(84 292) scale(.16)">{art}</g><g transform="translate(126 300) scale(.08)">{art}</g>'
            f'<rect x="170" y="280" width="48" height="48" rx="11" fill="{DEEP}"/><g transform="translate(176 286) scale(.18)">{rev}</g>'
            f'<rect x="230" y="292" width="24" height="24" rx="6" fill="{DEEP}"/><g transform="translate(233 295) scale(.09)">{rev}</g>'
            f'<text x="24" y="376" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">{i+1:02d}</text>'
            f'<text x="56" y="376" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="{INK}">{name}</text>'
            f'<foreignObject x="24" y="392" width="488" height="90"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px/1.5 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject></g>')
BW, BH = 60*2 + 3*536 + 2*24, 250 + 2*520 + 40
def wm(col):
    return (f'<g transform="scale(.5)">{M[0][2](col, ACC)}</g>'
            f'<text x="118" y="80" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="64" letter-spacing="-2" fill="{col}">heresay</text>')
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH + 260}" viewBox="0 0 {BW} {BH + 260}">', f'<rect width="{BW}" height="{BH + 260}" fill="#2b2d31"/>',
     f'<text x="60" y="94" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · letter marks, in your house style</text>',
     f'<text x="60" y="134" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">Learned from Greenroom and Imago: start from the letter · hide a second reading in it · one heavy rounded stroke · one bright accent piece · test at 16px</text>',
     f'<text x="60" y="164" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">Deep peacock {DEEP} carries the letter; bright turquoise {ACC} is a fill only, never text. Each card: light, app icon, then 48 · 32 · 16 px.</text>']
o += [card(i, *m) for i, m in enumerate(M)]
o.append(f'<g transform="translate(60 {BH})"><rect width="{BW-120}" height="200" rx="6" fill="#fff"/><text x="24" y="40" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">LOCKUP · WITH 01</text>'
         f'<g transform="translate(24 70)">{wm(DEEP)}</g><rect x="600" y="24" width="560" height="152" rx="6" fill="{DEEP}"/><g transform="translate(640 70)">{wm(W)}</g></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-letters.svg', 'w').write(svg)
open('docs/brand/heresay-logo-letters.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · letter marks</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
