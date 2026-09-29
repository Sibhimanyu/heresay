"""Heresay 'face' marks: the h's arch is a head, the double quote is a pair of eyes."""
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
SW = 34
STEM = 'M52 32 V168'
ARCH = {'normal': 'M52 130 C52 100 72 90 97 90 C124 90 142 106 142 130 V168',
        'tall':   'M52 116 C52 76 74 60 100 60 C128 60 146 78 146 108 V168'}
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
q = lambda x, y, s, a, r=0: f'<path d="{Q}" fill="{a}" transform="translate({x} {y}) rotate({r}) scale({s})"/>'
def letter(arch, col):
    return (f'<path d="{STEM}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>'
            f'<path d="{ARCH[arch]}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round"/>')
V = [
 ('Peek', 'tall', lambda a, bg: q(88, 124, .55, a) + q(112, 124, .55, a),
  'A taller arch makes a head. Two opening quotes peek out from under it.'),
 ('Listening', 'tall', lambda a, bg: q(90, 112, .55, a, 180) + q(114, 112, .55, a, 180),
  'Closing quotes as eyes, glancing down and left: toward the user who is speaking.'),
 ('Curious', 'tall', lambda a, bg: q(88, 106, .5, a) + q(111, 106, .5, a),
  'Eyes high under the brow, looking up. Interested in what you have to say.'),
 ('Round eyes', 'tall', lambda a, bg: f'<circle cx="87" cy="118" r="10" fill="{a}"/><circle cx="113" cy="118" r="10" fill="{a}"/>',
  'The plainest face, for comparison with the quote eyes.'),
 ('Wink', 'tall', lambda a, bg: q(88, 122, .55, a) + f'<path d="M104 116 H120" stroke="{a}" stroke-width="9" stroke-linecap="round"/>',
  'One quote, one wink. Friendly, a little cheeky, like the name.'),
 ('Heard, smiling', 'tall', lambda a, bg: q(88, 114, .5, a) + q(111, 114, .5, a) + f'<path d="M86 146 Q99 158 112 146" fill="none" stroke="{a}" stroke-width="8" stroke-linecap="round"/>',
  'Quote eyes and a small smile under them: the moment a report gets an answer.'),
 ('Eyes in the stroke', 'normal', lambda a, bg: q(90, 94, .42, bg) + q(110, 94, .42, bg),
  'The quote eyes are cut out of the arch itself. The letter is the face.'),
 ('Low and wide', 'tall', lambda a, bg: q(86, 148, .6, a) + q(114, 148, .6, a),
  'Eyes low in the opening, peering out from underneath: lots of room above.'),
 ('Classic h, small face', 'normal', lambda a, bg: q(88, 136, .45, a) + q(106, 136, .45, a),
  'Keeps the normal h and tucks a small pair of quote eyes under the shoulder.'),
 ('Eyes on top', 'normal', lambda a, bg: q(130, 40, .6, a) + q(154, 40, .6, a),
  'The double quote sits above the leg like the dot of an i: "hi", with eyes.'),
]
def mark(arch, eyes, col, acc, bg): return letter(arch, col) + eyes(acc, bg)
COLS, CW, CH, G, P = 5, 340, 470, 22, 60
rows = (len(V) + COLS - 1)//COLS
BW, BH = P*2 + COLS*CW + (COLS-1)*G, P*2 + 120 + rows*CH + (rows-1)*G
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">', f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
     f'<text x="{P}" y="{P+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · the h as a face</text>',
     f'<text x="{P}" y="{P+72}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">The arch is the head, the double quote is the eyes. Each: light, app icon, 48 · 32 · 16 px, and with the name.</text>']
for i, (name, arch, eyes, idea) in enumerate(V):
    x, y = P + (i % COLS)*(CW+G), P + 120 + (i//COLS)*(CH+G)
    L, R = mark(arch, eyes, DEEP, ACC, '#f5f6f7'), mark(arch, eyes, W, ACC, DEEP)
    Lw = mark(arch, eyes, DEEP, ACC, W)
    o.append(f'<g id="face-{i+1:02d}" transform="translate({x} {y})"><rect width="{CW}" height="{CH}" rx="6" fill="#fff"/>'
             f'<g transform="translate(18 18)"><rect width="146" height="146" rx="6" fill="#f5f6f7"/><g transform="translate(8 8) scale(.65)">{L}</g></g>'
             f'<g transform="translate(176 18)"><rect width="146" height="146" rx="32" fill="{DEEP}"/><g transform="translate(23 23) scale(.5)">{R}</g></g>'
             f'<g transform="translate(18 184) scale(.24)">{Lw}</g><g transform="translate(76 192) scale(.16)">{Lw}</g><g transform="translate(116 200) scale(.08)">{Lw}</g>'
             f'<rect x="150" y="184" width="48" height="48" rx="11" fill="{DEEP}"/><g transform="translate(156 190) scale(.18)">{R}</g>'
             f'<rect x="208" y="196" width="24" height="24" rx="6" fill="{DEEP}"/><g transform="translate(211 199) scale(.09)">{R}</g>'
             f'<text x="18" y="274" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">{i+1:02d}</text>'
             f'<text x="46" y="274" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="{INK}">{name}</text>'
             f'<foreignObject x="18" y="286" width="{CW-36}" height="96"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px/1.45 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject>'
             f'<g transform="translate(18 396)"><g transform="scale(.3)">{Lw}</g><text x="68" y="46" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="38" letter-spacing="-1.5" fill="{DEEP}">heresay</text></g></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-face.svg', 'w').write(svg)
open('docs/brand/heresay-logo-face.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · the h as a face</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
