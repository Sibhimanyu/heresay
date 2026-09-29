"""Refinements of the chosen mark: the soft-wave shape with quote eyes."""
import math
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
def wave(n=6, amp=6, r=74, rot=0):
    pts = []
    for i in range(360):
        t = 2*math.pi*i/360; rr = r + amp*math.sin(n*t + rot)
        pts.append(f'{100+rr*math.cos(t):.1f} {100+rr*math.sin(t):.1f}')
    return 'M' + ' L'.join(pts) + 'Z'
q = lambda x, y, s, a, r=0: f'<path d="{Q}" fill="{a}" transform="translate({x} {y}) rotate({r}) scale({s})"/>'
def eyes(kind, a):
    return {
     'up':      q(82, 102, 1.0, a, -24) + q(120, 98, 1.0, a, -24),
     'up-big':  q(80, 106, 1.25, a, -24) + q(124, 101, 1.25, a, -24),
     'up-soft': q(82, 102, 1.0, a, -12) + q(120, 100, 1.0, a, -12),
     'straight':q(81, 104, 1.05, a) + q(119, 104, 1.05, a),
     'high':    q(82, 92, 1.0, a, -24) + q(120, 88, 1.0, a, -24),
     'smile':   q(83, 94, .9, a, -20) + q(118, 91, .9, a, -20) + f'<path d="M80 128 Q100 144 120 128" fill="none" stroke="{a}" stroke-width="9" stroke-linecap="round"/>',
     'right':   q(88, 102, 1.0, a, -40) + q(126, 96, 1.0, a, -40),
    }[kind]
V = [
 ('Your pick', dict(), 'up', DEEP, W, 'Six soft waves, quote eyes tilted up. The starting point.'),
 ('Gentler waves', dict(amp=4), 'up', DEEP, W, 'Shallower waves: calmer, closer to a circle, cleaner at small sizes.'),
 ('Bolder waves', dict(amp=9), 'up', DEEP, W, 'Deeper waves: more playful and easier to recognise.'),
 ('Five waves', dict(n=5, amp=7), 'up', DEEP, W, 'Five lobes feel more hand-made and flower-like.'),
 ('Seven waves', dict(n=7, amp=6), 'up', DEEP, W, 'Seven lobes read rounder and more even.'),
 ('Bigger eyes', dict(), 'up-big', DEEP, W, 'Larger quotes: the face reads from further away.'),
 ('Softer glance', dict(), 'up-soft', DEEP, W, 'Less tilt: attentive rather than looking up.'),
 ('Looking up and right', dict(), 'right', DEEP, W, 'A stronger glance: curious, looking forward.'),
 ('Eyes higher', dict(), 'high', DEEP, W, 'Eyes placed higher, leaving a calm space below, like a face with a chin.'),
 ('With a smile', dict(), 'smile', DEEP, W, 'A small smile makes it unmistakably a face.'),
 ('Turquoise eyes', dict(), 'up', DEEP, ACC, 'Bright eyes on deep peacock, like Greenroom\'s lime head.'),
 ('Flipped colours', dict(), 'up', ACC, DEEP, 'A bright turquoise body with deep eyes. Loudest on dark screens.'),
]
def mark(shape, e, fill, ink): return f'<path d="{wave(**shape)}" fill="{fill}"/>' + eyes(e, ink)
COLS, CW, CH, G, P = 4, 400, 450, 24, 60
rows = (len(V) + COLS - 1)//COLS
BW, BH = P*2 + COLS*CW + (COLS-1)*G, P*2 + 120 + rows*CH + (rows-1)*G
o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">', f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
     f'<text x="{P}" y="{P+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · soft wave, refined</text>',
     f'<text x="{P}" y="{P+72}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">Wave count and depth, eye size and glance, colour. Each: light, app icon, dark, 48 · 32 · 16 px, and with the name.</text>']
for i, (name, shape, e, fill, ink, idea) in enumerate(V):
    x, y = P + (i % COLS)*(CW+G), P + 120 + (i//COLS)*(CH+G)
    L = mark(shape, e, fill, ink)
    Dk = mark(shape, e, ACC if fill == DEEP else fill, DEEP if fill == DEEP else ink)
    o.append(f'<g id="wave-{i+1:02d}" transform="translate({x} {y})"><rect width="{CW}" height="{CH}" rx="6" fill="#fff"/>'
             f'<g transform="translate(18 18)"><rect width="116" height="116" rx="6" fill="#f5f6f7"/><g transform="translate(8 8) scale(.5)">{L}</g></g>'
             f'<g transform="translate(142 18)"><rect width="116" height="116" rx="26" fill="{DEEP if fill != DEEP else "#e6f4f2"}"/><g transform="translate(18 18) scale(.4)">{L}</g></g>'
             f'<g transform="translate(266 18)"><rect width="116" height="116" rx="6" fill="#16181d"/><g transform="translate(8 8) scale(.5)">{Dk}</g></g>'
             f'<g transform="translate(18 152) scale(.24)">{L}</g><g transform="translate(76 160) scale(.16)">{L}</g><g transform="translate(116 168) scale(.08)">{L}</g>'
             f'<text x="18" y="238" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="{DEEP}">{i+1:02d}</text>'
             f'<text x="46" y="238" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="{INK}">{name}</text>'
             f'<foreignObject x="18" y="250" width="{CW-36}" height="80"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px/1.45 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject>'
             f'<g transform="translate(18 350)"><g transform="scale(.36)">{L}</g><text x="84" y="52" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="800" font-size="44" letter-spacing="-1.5" fill="{DEEP}">heresay</text></g></g>')
o.append('</svg>')
svg = '\n'.join(o)
open('docs/brand/heresay-logo-wave.svg', 'w').write(svg)
open('docs/brand/heresay-logo-wave.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · soft wave refined</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
