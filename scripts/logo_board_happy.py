"""'Eyes on top' h, made to look happy instead of upset."""
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
SW = 34
STEM = 'M52 32 V168'
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
ARCH = {
 'round':  'M52 130 C52 100 72 90 97 90 C124 90 142 106 142 130 V168',
 'low':    'M52 136 C52 110 72 102 97 102 C124 102 142 116 142 136 V168',
 'square': 'M52 132 V116 C52 104 60 96 72 96 H122 C134 96 142 104 142 116 V168',
 'foot':   'M52 130 C52 100 72 90 97 90 C124 90 142 106 142 130 V146 C142 168 164 174 180 158',
 'sqfoot': 'M52 132 V116 C52 104 60 96 72 96 H122 C134 96 142 104 142 116 V146 C142 168 164 174 180 158',
}
q = lambda x, y, s, a, r=0: f'<path d="{Q}" fill="{a}" transform="translate({x} {y}) rotate({r}) scale({s})"/>'
EYES = {
 'quote':  lambda a: q(130, 40, .6, a) + q(154, 40, .6, a),
 'lifted': lambda a: q(130, 30, .6, a) + q(154, 30, .6, a),
 'up':     lambda a: q(130, 38, .6, a, -28) + q(155, 34, .6, a, -28),
 'big':    lambda a: q(126, 36, .78, a) + q(158, 36, .78, a),
 'happy':  lambda a: f'<path d="M118 46 Q129 26 140 46 M146 46 Q157 26 168 46" fill="none" stroke="{a}" stroke-width="9" stroke-linecap="round"/>',
}
V = [
 ('Where we are', 'round', 'quote', 'The one you picked. The arch under the eyes reads as a frown.'),
 ('More room', 'low', 'lifted', 'Eyes lifted and the shoulder lowered, so the arch stops reading as a mouth.'),
 ('Flatter shoulder', 'square', 'quote', 'A squarer shoulder has no downturned curve, so there is no frown to see.'),
 ('Looking up', 'round', 'up', 'The quote eyes tilt up and outward. Upward eyes read hopeful, not cross.'),
 ('Big eyes', 'low', 'big', 'Bigger, rounder quote eyes look wide and friendly.'),
 ('Happy eyes', 'low', 'happy', 'Closed, smiling eyes (^ ^). Content: the report has been heard.'),
 ('Smiling foot', 'foot', 'quote', 'The leg ends in an upward curl: the whole letter smiles.'),
 ('Foot + big eyes', 'foot', 'big', 'The curl and the wide eyes together. The friendliest.'),
 ('Square + foot', 'sqfoot', 'lifted', 'No frown curve at all, a smile at the base, quote eyes on top.'),
 ('Square + happy eyes', 'square', 'happy', 'Calm and pleased. The quietest of the happy versions.'),
]
def mark(arch, eyes, col, acc):
    return (f'<path d="{STEM}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>'
            f'<path d="{ARCH[arch]}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>' + EYES[eyes](acc))
COLS, CW, CH, G, P = 5, 340, 470, 22, 60
rows = (len(V) + COLS - 1)//COLS
BW, BH = P*2 + COLS*CW + (COLS-1)*G, P*2 + 120 + rows*CH + (rows-1)*G
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">', f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
     f'<text x="{P}" y="{P+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · eyes on top, but happy</text>',
     f'<text x="{P}" y="{P+72}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">The frown comes from the arch sitting under the eyes. Fixes: more room, a flatter shoulder, happier eyes, a smiling foot.</text>']
for i, (name, arch, eyes, idea) in enumerate(V):
    x, y = P + (i % COLS)*(CW+G), P + 120 + (i//COLS)*(CH+G)
    L, R = mark(arch, eyes, DEEP, ACC), mark(arch, eyes, W, ACC)
    o.append(f'<g id="happy-{i+1:02d}" transform="translate({x} {y})"><rect width="{CW}" height="{CH}" rx="6" fill="#fff"/>'
             f'<g transform="translate(18 18)"><rect width="146" height="146" rx="6" fill="#f5f6f7"/><g transform="translate(8 8) scale(.65)">{L}</g></g>'
             f'<g transform="translate(176 18)"><rect width="146" height="146" rx="32" fill="{DEEP}"/><g transform="translate(23 23) scale(.5)">{R}</g></g>'
             f'<g transform="translate(18 184) scale(.24)">{L}</g><g transform="translate(76 192) scale(.16)">{L}</g><g transform="translate(116 200) scale(.08)">{L}</g>'
             f'<rect x="150" y="184" width="48" height="48" rx="11" fill="{DEEP}"/><g transform="translate(156 190) scale(.18)">{R}</g>'
             f'<rect x="208" y="196" width="24" height="24" rx="6" fill="{DEEP}"/><g transform="translate(211 199) scale(.09)">{R}</g>'
             f'<text x="18" y="274" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">{i+1:02d}</text>'
             f'<text x="46" y="274" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="{INK}">{name}</text>'
             f'<foreignObject x="18" y="286" width="{CW-36}" height="96"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px/1.45 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject>'
             f'<g transform="translate(18 396)"><g transform="scale(.3)">{L}</g><text x="68" y="46" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="38" letter-spacing="-1.5" fill="{DEEP}">heresay</text></g></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-happy.svg', 'w').write(svg)
open('docs/brand/heresay-logo-happy.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · eyes on top, happy</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
