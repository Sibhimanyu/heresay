"""The recommended Heresay mark: bolder soft wave + bigger quote eyes, shown in use."""
DEEP, ACC, W, INK = '#0b5e57', '#2dd4bf', '#ffffff', '#15171c'
import math
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'
def wave(n=6, amp=9, r=74):
    return 'M' + ' L'.join(f'{100+(r+amp*math.sin(n*t))*math.cos(t):.1f} {100+(r+amp*math.sin(n*t))*math.sin(t):.1f}' for t in (2*math.pi*i/360 for i in range(360))) + 'Z'
q = lambda x, y, s, a, r=0: f'<path d="{Q}" fill="{a}" transform="translate({x} {y}) rotate({r}) scale({s})"/>'
def mark(body, eye): return f'<path d="{wave()}" fill="{body}"/>' + q(80, 106, 1.25, eye, -24) + q(124, 101, 1.25, eye, -24)
M, Mt, Md = mark(DEEP, W), mark(DEEP, ACC), mark(ACC, DEEP)
F = 'Helvetica Neue, Helvetica, Arial, sans-serif'
def wm(x, y, s, col, m): return f'<g transform="translate({x} {y})"><g transform="scale({s})">{m}</g><text x="{200*s+18*s/0.5}" y="{128*s}" font-family="{F}" font-weight="800" font-size="{96*s}" letter-spacing="{-3*s}" fill="{col}">heresay</text></g>'
o = ['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1180" viewBox="0 0 1600 1180">', '<rect width="1600" height="1180" fill="#2b2d31"/>',
 f'<text x="60" y="92" font-family="{F}" font-size="34" font-weight="700" fill="#f5f6f7">Recommended: bolder soft wave + bigger quote eyes</text>',
 f'<text x="60" y="130" font-family="{F}" font-size="18" fill="#b9bdc6">A soft, friendly blob that is also a face: the quote marks are its eyes, looking up at whoever is speaking.</text>',
 # hero
 f'<rect x="60" y="170" width="720" height="520" rx="8" fill="#fff"/><g transform="translate(220 200) scale(2)">{M}</g>',
 f'<text x="84" y="668" font-family="{F}" font-size="15" fill="#4f5666">Primary · deep peacock {DEEP}, white eyes</text>',
 # variants
 f'<rect x="804" y="170" width="356" height="250" rx="8" fill="#16181d"/><g transform="translate(882 190) scale(1)">{Md}</g><text x="824" y="404" font-family="{F}" font-size="15" fill="#b9bdc6">On dark · turquoise body</text>',
 f'<rect x="1184" y="170" width="356" height="250" rx="8" fill="#fff"/><g transform="translate(1262 190) scale(1)">{Mt}</g><text x="1204" y="404" font-family="{F}" font-size="15" fill="#4f5666">Accent · turquoise eyes</text>',
 # app icons + sizes
 f'<rect x="804" y="440" width="736" height="250" rx="8" fill="#fff"/>',
 f'<rect x="832" y="470" width="150" height="150" rx="34" fill="{DEEP}"/><g transform="translate(847 485) scale(.6)">{mark(W, DEEP)}</g>',
 f'<rect x="1004" y="470" width="150" height="150" rx="34" fill="#e6f4f2"/><g transform="translate(1019 485) scale(.6)">{M}</g>',
 ''.join(f'<g transform="translate({x} {545-s/2}) scale({s/200})">{M}</g>' for x, s in [(1190, 64), (1270, 48), (1334, 32), (1382, 24), (1422, 16)]),
 f'<text x="1190" y="610" font-family="{F}" font-size="13" fill="#4f5666">64 · 48 · 32 · 24 · 16 px</text>',
 f'<text x="832" y="666" font-family="{F}" font-size="15" fill="#4f5666">App icons, and the mark at real sizes</text>',
 # lockups
 f'<rect x="60" y="714" width="740" height="200" rx="8" fill="#fff"/>' + wm(100, 764, .5, DEEP, M),
 f'<rect x="820" y="714" width="720" height="200" rx="8" fill="{DEEP}"/>' + wm(860, 764, .5, W, mark(W, DEEP)),
 # in use: the widget button in a host app
 f'<rect x="60" y="938" width="1480" height="200" rx="8" fill="#f5f6f7"/>',
 f'<rect x="90" y="962" width="700" height="152" rx="10" fill="#fff" stroke="#e3e6ea"/><rect x="110" y="986" width="260" height="12" rx="6" fill="#e9ecf1"/><rect x="110" y="1010" width="380" height="12" rx="6" fill="#e9ecf1"/>',
 f'<rect x="604" y="1054" width="164" height="44" rx="22" fill="#fff" stroke="#e3e6ea"/><g transform="translate(616 1062) scale(.14)">{M}</g><text x="652" y="1082" font-family="{F}" font-size="16" font-weight="700" fill="{INK}">Report</text>',
 f'<text x="820" y="1010" font-family="{F}" font-size="22" font-weight="700" fill="{INK}">In someone else\'s app</text>',
 f'<text x="820" y="1044" font-family="{F}" font-size="16" fill="#4f5666">The little face sits on the Report button. It reads as friendly,</text>',
 f'<text x="820" y="1068" font-family="{F}" font-size="16" fill="#4f5666">not as an error or a warning, and it stays clear at 16px.</text>',
 '</svg>']
svg = '\n'.join(o)
open('docs/brand/heresay-logo-recommended.svg', 'w').write(svg)
open('docs/brand/heresay-logo-recommended.html', 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · recommended mark</title><style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
