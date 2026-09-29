"""Generate the Heresay logo exploration board: docs/brand/heresay-logo-board.svg (+ .html)."""
import math
P, PD, PS, INK, W = '#0f766e', '#0b5e57', '#e6f4f2', '#15171c', '#ffffff'
seal = open('/tmp/seal.txt').read()
Q = 'M-13 12 C-13 -8 -2 -24 17 -32 L20 -25 C8 -18 2 -9 3 -1 A13 13 0 1 1 -13 12 Z'   # one "6"-shaped comma
def quote(x, y, s, fill): return f'<g transform="translate({x} {y}) scale({s})" fill="{fill}"><path d="{Q}" transform="translate(-19 0)"/><path d="{Q}" transform="translate(19 0)"/></g>'
def comma(x, y, s, fill, rot=0): return f'<path d="{Q}" fill="{fill}" transform="translate({x} {y}) rotate({rot}) scale({s})"/>'
def arrow(x, y, ang, size, col):
    a = math.radians(ang); pts = [(x, y)]
    for d in (150, -150):
        b = a + math.radians(d); pts.append((x + size*math.cos(b), y + size*math.sin(b)))
    return '<path d="M{:.1f} {:.1f} L{:.1f} {:.1f} L{:.1f} {:.1f} Z" fill="{}"/>'.format(*pts[0], *pts[1], *pts[2], col)

EAR_O = 'M132 78 C132 48 110 30 86 30 C58 30 40 52 40 80 C40 102 56 110 62 126 C68 142 62 162 84 166 C100 169 108 156 108 144'
EAR_I = 'M64 82 C64 64 74 54 88 54 C102 54 110 64 108 78 C106 90 94 94 92 104'
def ear(col, t=''): return (f'<g transform="{t}"><path d="{EAR_O}" fill="none" stroke="{col}" stroke-width="16" stroke-linecap="round"/>'
                            f'<path d="{EAR_I}" fill="none" stroke="{col}" stroke-width="14" stroke-linecap="round"/></g>')
BUB = 'M60 40 H140 A30 30 0 0 1 170 70 V112 A30 30 0 0 1 140 142 H86 L56 166 L62 142 H60 A30 30 0 0 1 30 112 V70 A30 30 0 0 1 60 40 Z'
TEAR = 'M100 22 C146 56 156 112 100 176 C44 112 54 56 100 22 Z'

M = []  # (family, name, idea, svg-in-200-box)
M.append(('Quote', 'Seal', 'A quote pressed in wax: on the record.',
  f'<path d="{seal}" fill="{P}"/><circle cx="100" cy="100" r="60" fill="none" stroke="{PD}" stroke-width="3"/>' + quote(100, 108, 1, W)))
M.append(('Quote', 'Facing quotes', 'An opening and a closing mark: said, then heard.',
  comma(66, 106, 2.0, P) + comma(134, 94, 2.0, INK, 180)))
M.append(('Quote', 'Quote in a bubble', 'The report itself: a quote, in the user\'s words.',
  f'<path d="{BUB}" fill="{P}"/>' + quote(100, 98, 1.1, W)))
M.append(('Quote', 'Open quote, big', 'Just the opening mark. Everything starts with what they said.',
  quote(100, 112, 2.3, P)))
M.append(('Speech', 'Reply bubble', 'A bubble with a smaller answer tucked inside.',
  f'<path d="{BUB}" fill="none" stroke="{P}" stroke-width="12" stroke-linejoin="round"/>'
  f'<g transform="translate(62 58) scale(.42)"><path d="{BUB}" fill="{P}" transform="translate(200 0) scale(-1 1)"/></g>'))
M.append(('Speech', 'Round trip', 'A bubble whose tail loops back: every report comes back answered.',
  '<rect x="34" y="36" width="132" height="92" rx="46" fill="%s"/>' % P +
  f'<path d="M70 124 C58 156 86 176 116 160" fill="none" stroke="{P}" stroke-width="12" stroke-linecap="round"/>' + arrow(126, 152, -35, 26, P)))
M.append(('Speech', 'Dot in a ring', 'The smallest version: something said, held and heard.',
  f'<path d="M100 32 A68 68 0 1 1 40 132 L30 170 L68 158 A68 68 0 0 1 100 32 Z" fill="none" stroke="{P}" stroke-width="14" stroke-linejoin="round"/><circle cx="100" cy="100" r="20" fill="{P}"/>'))
M.append(('Ear', 'The ear', 'One line that listens; the dot is what was said.', ear(INK) + f'<circle cx="152" cy="118" r="15" fill="{P}"/>'))
M.append(('Ear', 'Ear and waves', 'Sound arriving, and someone actually listening.',
  ear(P, 'translate(52 16) scale(.82)') + f'<path d="M48 70 A44 44 0 0 0 48 130" fill="none" stroke="{P}" stroke-width="10" stroke-linecap="round"/>'
  f'<path d="M24 54 A68 68 0 0 0 24 146" fill="none" stroke="{P}" stroke-width="10" stroke-linecap="round" opacity=".45"/>'))
M.append(('Ear', 'Ear in a bubble', 'Speech outside, listening inside.',
  f'<path d="{BUB}" fill="{P}"/>' + ear(W, 'translate(58 30) scale(.52)')))
M.append(('Letter H', 'Two bubbles make an H', 'You and your user, facing each other. The join is the conversation.',
  f'<rect x="36" y="36" width="52" height="128" rx="26" fill="{P}"/><rect x="112" y="36" width="52" height="128" rx="26" fill="{INK}"/>'
  f'<path d="M84 88 L112 100 L84 112 Z" fill="{P}"/><path d="M116 88 L88 100 L116 112 Z" fill="{INK}" opacity="0"/>'))
M.append(('Letter H', 'h that speaks', 'A lowercase h whose shoulder ends in a speech tail.',
  f'<path d="M66 34 V166" stroke="{P}" stroke-width="22" stroke-linecap="round"/>'
  f'<path d="M66 112 C66 86 86 76 106 76 C128 76 140 92 140 112 V150 L158 170 H128 V112" fill="none" stroke="{P}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>'))
M.append(('Letter H', 'H in the negative', 'A solid bubble with an H cut out of it.',
  f'<path d="{BUB}" fill="{P}"/><path d="M76 64 V118 M124 64 V118 M76 91 H124" stroke="{W}" stroke-width="16" stroke-linecap="round"/>'))
M.append(('Justice', 'The bell', 'The bell of justice: anyone can ring it, and someone must answer.',
  f'<circle cx="100" cy="36" r="9" fill="{INK}"/><path d="M56 140 C58 96 62 58 100 52 C138 58 142 96 144 140 L156 152 H44 Z" fill="{P}"/><circle cx="100" cy="172" r="12" fill="{INK}"/>'))
M.append(('Justice', 'Speaking gavel', 'A gavel whose head is a speech bubble: the ruling is a reply.',
  f'<g transform="rotate(-32 100 100)"><rect x="52" y="46" width="96" height="50" rx="25" fill="{P}"/><path d="M70 92 L60 112 L88 96 Z" fill="{P}"/>'
  f'<rect x="94" y="94" width="12" height="78" rx="6" fill="{INK}"/></g>'))
M.append(('Justice', 'Scales of speech', 'Two bubbles in balance: both sides get heard.',
  f'<path d="M100 36 V160 M60 160 H140" stroke="{INK}" stroke-width="10" stroke-linecap="round"/><path d="M44 64 H156" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
  f'<path d="M50 64 L38 104 M50 64 L62 104 M150 64 L138 104 M150 64 L162 104" stroke="{INK}" stroke-width="4"/>'
  f'<rect x="30" y="100" width="42" height="28" rx="14" fill="{P}"/><rect x="128" y="100" width="42" height="28" rx="14" fill="{P}"/>'))
M.append(('Justice', 'Courthouse', 'A courthouse whose door is a speech bubble.',
  f'<path d="M34 72 L100 36 L166 72 Z" fill="{INK}"/><rect x="44" y="80" width="16" height="70" fill="{INK}"/><rect x="140" y="80" width="16" height="70" fill="{INK}"/>'
  f'<rect x="32" y="152" width="136" height="14" rx="3" fill="{INK}"/><rect x="74" y="88" width="52" height="40" rx="20" fill="{P}"/><path d="M84 124 L78 142 L98 126 Z" fill="{P}"/>'))
M.append(('Justice', 'Stamp: heard', 'The mark every report earns.',
  f'<g transform="rotate(-8 100 100)"><rect x="24" y="62" width="152" height="76" rx="12" fill="none" stroke="{P}" stroke-width="8"/>'
  f'<rect x="34" y="72" width="132" height="56" rx="6" fill="none" stroke="{P}" stroke-width="3"/>'
  f'<text x="100" y="114" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="32" letter-spacing="3" fill="{P}">HEARD</text></g>'))
M.append(('Peacock', 'Feather eye', 'The eye on a peacock feather: being seen and heard.',
  f'<path d="{TEAR}" fill="{P}"/><g transform="translate(100 104) scale(.62) translate(-100 -100)"><path d="{TEAR}" fill="#2dd4bf"/></g>'
  f'<g transform="translate(100 108) scale(.34) translate(-100 -100)"><path d="{TEAR}" fill="#123a5c"/></g>' + comma(100, 112, .9, W)))
M.append(('Peacock', 'Quill', 'A peacock-feather quill: the user writes, you read.',
  f'<path d="M152 30 C100 44 64 88 52 150 C92 132 134 94 152 30 Z" fill="{P}"/><path d="M152 30 L40 174" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
  f'<ellipse cx="120" cy="72" rx="14" ry="20" transform="rotate(40 120 72)" fill="#123a5c"/><ellipse cx="120" cy="72" rx="6" ry="9" transform="rotate(40 120 72)" fill="#2dd4bf"/>'))
M.append(('Peacock', 'Fan of voices', 'Feather fan made of speech bubbles: many users, one place.',
  ''.join(f'<g transform="rotate({a} 100 150)"><rect x="90" y="40" width="20" height="96" rx="10" fill="{P}" opacity="{o}"/><circle cx="100" cy="44" r="14" fill="{P}" opacity="{o}"/></g>'
          for a, o in [(-50, .45), (-25, .7), (0, 1), (25, .7), (50, .45)]) + f'<circle cx="100" cy="150" r="12" fill="{INK}"/>'))
M.append(('Wordmark', 'here | say', 'A pause between "here" and "say": the moment of listening.',
  f'<text x="100" y="116" text-anchor="middle" font-family="Libre Caslon Text, Georgia, serif" font-size="44" fill="{INK}">here<tspan fill="{P}" font-family="Helvetica, Arial" font-weight="300"> | </tspan>say</text>'))
M.append(('Wordmark', 'heresay”', 'The name ends in a closing quote. Every report gets its end.',
  f'<text x="10" y="118" font-family="Libre Caslon Text, Georgia, serif" font-size="42" fill="{INK}">heresay</text>' + comma(186, 90, .8, P, 180)))
M.append(('Wordmark', 'Stacked', '"here" over "say": the invitation, read top to bottom.',
  f'<text x="44" y="94" font-family="Libre Caslon Text, Georgia, serif" font-size="56" fill="{INK}">here</text>'
  f'<text x="44" y="150" font-family="Libre Caslon Text, Georgia, serif" font-style="italic" font-size="56" fill="{P}">say</text>'))

COLS, CW, CH, GAP, PAD = 6, 300, 360, 24, 60
rows = math.ceil(len(M) / COLS)
BW, BH = PAD*2 + COLS*CW + (COLS-1)*GAP, PAD*2 + 110 + rows*CH + (rows-1)*GAP
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">',
       f'<rect width="{BW}" height="{BH}" fill="#2b2d31"/>',
       f'<text x="{PAD}" y="{PAD+34}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#f5f6f7">Heresay · logo exploration</text>',
       f'<text x="{PAD}" y="{PAD+70}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b9bdc6">{len(M)} directions in six families · peacock {P} · small preview at 24px in each corner</text>']
for i, (fam, name, idea, art) in enumerate(M):
    c, r = i % COLS, i // COLS
    x, y = PAD + c*(CW+GAP), PAD + 110 + r*(CH+GAP)
    out.append(f'<g id="logo-{i+1:02d}" transform="translate({x} {y})">'
               f'<rect width="{CW}" height="{CH}" rx="6" fill="#ffffff"/>'
               f'<g transform="translate(50 26)"><g transform="scale(1)">{art}</g></g>'
               f'<g transform="translate({CW-46} 204) scale(.12)">{art}</g>'
               f'<text x="18" y="252" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="{P}">{i+1:02d} · {fam.upper()}</text>'
               f'<text x="18" y="276" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="{INK}">{name}</text>'
               f'<foreignObject x="18" y="286" width="{CW-36}" height="64"><div xmlns="http://www.w3.org/1999/xhtml" style="font:14px/1.4 Helvetica, Arial, sans-serif;color:#4f5666">{idea}</div></foreignObject>'
               '</g>')
out.append('</svg>')
svg = '\n'.join(out)
open('docs/brand/heresay-logo-board.svg', 'w').write(svg)
open('docs/brand/heresay-logo-board.html', 'w').write(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Heresay · logo exploration</title>'
  '<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital@0;1&display=swap" rel="stylesheet">'
  '<style>body{margin:0;background:#2b2d31}svg{display:block;width:100%;height:auto}</style></head><body>' + svg + '</body></html>')
print(len(M), 'logos', BW, 'x', BH)
