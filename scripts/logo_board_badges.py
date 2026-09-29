"""Heresay 'quote face' badges: a container shape with the double quote as eyes."""
import math
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
def polar(fn, n=360):
    pts = [(100 + fn(2*math.pi*i/n)*math.cos(2*math.pi*i/n), 100 + fn(2*math.pi*i/n)*math.sin(2*math.pi*i/n)) for i in range(n)]
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'
def squircle(r=78, n=5):
    pts = []
    for i in range(360):
        t = 2*math.pi*i/360; c, s = math.cos(t), math.sin(t)
        pts.append((100 + r*math.copysign(abs(c)**(2/n), c), 100 + r*math.copysign(abs(s)**(2/n), s)))
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'
S = {
 'seal':     polar(lambda t: 76 + 5*math.sin(18*t)),
 'flower':   polar(lambda t: 72 + 9*math.sin(10*t)),
 'fine':     polar(lambda t: 78 + 3*math.sin(30*t)),
 'wavy':     polar(lambda t: 74 + 6*math.sin(6*t)),
 'circle':   polar(lambda t: 78),
 'squircle': squircle(),
 'bubble':   'M60 34 H140 A36 36 0 0 1 176 70 V118 A36 36 0 0 1 140 154 H90 L56 180 L64 154 H60 A36 36 0 0 1 24 118 V70 A36 36 0 0 1 60 34 Z',
 'pebble':   'M100 24 C150 22 182 56 178 104 C174 150 138 180 94 176 C50 172 22 140 24 98 C26 56 54 26 100 24 Z',
 'dome':     'M28 176 V104 A72 72 0 0 1 172 104 V176 Z',
 'arch':     'M40 176 V92 A60 60 0 0 1 160 92 V176 A0 0 0 0 1 160 176 Z',
 'drop':     'M100 18 C150 70 172 100 172 124 A72 58 0 0 1 28 124 C28 100 50 70 100 18 Z',
 'pill':     'M62 50 H138 A50 50 0 0 1 138 150 H62 A50 50 0 0 1 62 50 Z',
 'hex':      polar(lambda t: 76 / max(abs(math.cos((t % (math.pi/3)) - math.pi/6)), .001) * math.cos(math.pi/6) + 0),
 'cloud':    'M60 150 A34 34 0 0 1 44 88 A40 40 0 0 1 104 50 A38 38 0 0 1 164 84 A34 34 0 0 1 150 150 Z',
}
q = lambda x, y, s, a, r=0: f'<path d="{Q}" fill="{a}" transform="translate({x} {y}) rotate({r}) scale({s})"/>'
E = {
 'open':   lambda a, cy=104, s=1.05: q(81, cy, s, a) + q(119, cy, s, a),
 'close':  lambda a, cy=96, s=1.05: q(81, cy, s, a, 180) + q(119, cy, s, a, 180),
 'smile':  lambda a, cy=92, s=.9: q(83, cy, s, a) + q(117, cy, s, a) + f'<path d="M80 128 Q100 146 120 128" fill="none" stroke="{a}" stroke-width="9" stroke-linecap="round"/>',
 'wink':   lambda a, cy=104, s=1.05: q(81, cy, s, a) + f'<path d="M104 96 H132" stroke="{a}" stroke-width="10" stroke-linecap="round"/>',
 'up':     lambda a, cy=102, s=1.0: q(82, cy, s, a, -24) + q(120, cy - 4, s, a, -24),
 'big':    lambda a, cy=108, s=1.35: q(78, cy, s, a) + q(124, cy, s, a),
}
V = [
 ('Seal', 'seal', 'open', DEEP, W, 'The one you liked: a quote pressed in wax, which is also a face.'),
 ('Seal, glancing', 'seal', 'close', DEEP, W, 'Closing quotes as eyes, looking down and left at whoever is talking.'),
 ('Seal, smiling', 'seal', 'smile', DEEP, W, 'The same seal with a small smile: heard, and happy about it.'),
 ('Seal, turquoise eyes', 'seal', 'open', DEEP, ACC, 'Bright eyes on the deep seal, like Greenroom\'s lime accent.'),
 ('Marigold', 'flower', 'open', DEEP, W, 'Fewer, rounder petals. A flower, and a nod to the garland welcome.'),
 ('Fine seal', 'fine', 'open', DEEP, W, 'Many small teeth, like a postage stamp or an official seal.'),
 ('Soft wave', 'wavy', 'up', DEEP, W, 'A gently wavy edge and eyes looking up. Calm and curious.'),
 ('Circle', 'circle', 'open', DEEP, W, 'The simplest container. Works everywhere, least ownable.'),
 ('Squircle', 'squircle', 'big', DEEP, W, 'An app-icon shape with big quote eyes. Made for the home screen.'),
 ('Speech bubble', 'bubble', 'open', DEEP, W, 'The bubble is the head, the quote is the eyes, the tail is the voice.'),
 ('Bubble, winking', 'bubble', 'wink', DEEP, W, 'A cheeky wink from inside the bubble. Playful, like the name.'),
 ('Pebble', 'pebble', 'close', DEEP, W, 'An organic, hand-made shape. Soft and human.'),
 ('Head', 'dome', 'open', DEEP, W, 'A rounded head and shoulders, peering out: someone is here.'),
 ('Arch window', 'arch', 'up', DEEP, W, 'A tall arched window with a face looking up through it.'),
 ('Drop', 'drop', 'open', DEEP, W, 'A drop, or the eye of a peacock feather, with eyes of its own.'),
 ('Pill', 'pill', 'open', DEEP, W, 'Wide and short: a friendly button shape, like the Report button itself.'),
 ('Hexagon', 'hex', 'open', DEEP, W, 'Soft-cornered hexagon: sturdier, more technical.'),
 ('Cloud', 'cloud', 'open', DEEP, W, 'A thought cloud: what users are thinking, said out loud.'),
 ('Turquoise seal', 'seal', 'open', ACC, DEEP, 'The colours flipped: a bright seal with deep eyes.'),
 ('Marigold, smiling', 'flower', 'smile', DEEP, ACC, 'Flower, smile and bright eyes: the warmest of the set.'),
]
def mark(shape, eyes, fill, ink): return f'<path d="{S[shape]}" fill="{fill}"/>' + E[eyes](ink)
COLS, CW, CH, G, P = 5, 340, 430, 22, 60
rows = (len(V) + COLS - 1)//COLS
BW, BH = P*2 + COLS*CW + (COLS-1)*G, P*2 + 120 + rows*CH + (rows-1)*G
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">', f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
     f'<text x="{P}" y="{P+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · quote faces</text>',
     f'<text x="{P}" y="{P+72}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">A shape with the double quote as its eyes. Each: large, on dark, at 48 · 32 · 16 px, and with the name.</text>']
for i, (name, shape, eyes, fill, ink, idea) in enumerate(V):
    x, y = P + (i % COLS)*(CW+G), P + 120 + (i//COLS)*(CH+G)
    L = mark(shape, eyes, fill, ink)
    Ld = mark(shape, eyes, fill if fill != DEEP else '#2dd4bf', ink if fill != DEEP else DEEP) if fill == DEEP else L
    o.append(f'<g id="face-{i+1:02d}" transform="translate({x} {y})"><rect width="{CW}" height="{CH}" rx="6" fill="#fff"/>'
             f'<g transform="translate(18 18)"><rect width="146" height="146" rx="6" fill="#f5f6f7"/><g transform="translate(8 8) scale(.65)">{L}</g></g>'
             f'<g transform="translate(176 18)"><rect width="146" height="146" rx="6" fill="#16181d"/><g transform="translate(8 8) scale(.65)">{Ld}</g></g>'
             f'<g transform="translate(18 184) scale(.24)">{L}</g><g transform="translate(76 192) scale(.16)">{L}</g><g transform="translate(116 200) scale(.08)">{L}</g>'
             f'<text x="18" y="262" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">{i+1:02d}</text>'
             f'<text x="46" y="262" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="{INK}">{name}</text>'
             f'<foreignObject x="18" y="274" width="{CW-36}" height="80"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px/1.45 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject>'
             f'<g transform="translate(18 362)"><g transform="scale(.3)">{L}</g><text x="70" y="44" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="38" letter-spacing="-1.5" fill="{DEEP}">heresay</text></g></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-quote-faces.svg', 'w').write(svg)
open('docs/brand/heresay-logo-quote-faces.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · quote faces</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
