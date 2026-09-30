"""Write the Heresay loading animations into brand/svg/loaders and a preview page, brand/heresay-loaders.html.

Each loader is one self-contained animated SVG (CSS keyframes, plus SMIL where the outline itself changes),
so it works as <img src>, inline, or as a CSS background. All of them hold still under prefers-reduced-motion.
"""
import math, os, sys; sys.path.insert(0, 'scripts')
from brand_geometry import *

def body(amp=A, n=240, r=R):
    pts = []
    for i in range(n):
        t = 2*math.pi*i/n; rr = r + amp*math.sin(N*t)
        pts.append(f'{100+rr*math.cos(t):.2f} {100+rr*math.sin(t):.2f}')
    return 'M' + ' L'.join(pts) + 'Z'

def eye(x, y, fill, cls='eye'):
    # The eye sits in a group whose origin is its centre, so CSS can blink, hop or glance it in place.
    return (f'<g class="{cls}" style="transform-origin:{x}px {y}px">'
            f'<path d="{Q}" fill="{fill}" transform="translate({x} {y}) rotate({EYE_TILT}) scale({EYE_SCALE})"/></g>')

def eyes_g(fill, cls='eye'):
    return f'<g class="eyes">{eye(*EYES[0], fill, cls + " e1")}{eye(*EYES[1], fill, cls + " e2")}</g>'

BASE = ('svg *{transform-box:view-box}'
        '.body,.eyes,.all{transform-origin:100px 100px}'
        '@media (prefers-reduced-motion:reduce){*{animation:none!important}}')

def doc(css, inner, label='Loading'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="{label}">'
            f'<style>{BASE}{css}</style>{inner}</svg>\n')

def loaders(bf, ef):
    """bf: body fill, ef: eye fill. Returns {name: (title, what it says, svg)}."""
    out = {}

    # 1. Swirl: the waves travel round the face while the face stays upright. Rotating the outline by one
    #    wave (60 degrees) looks identical to where it started, so a steady spin loops with no seam.
    out['swirl'] = ('Swirl', 'The waves travel; the face stays put. Default spinner.', doc(
        '.body{animation:spin 2.4s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}'
        '.eye{animation:blink 4.8s infinite}'
        '@keyframes blink{0%,46%,54%,100%{transform:scaleY(1)}50%{transform:scaleY(.12)}}',
        f'<path class="body" d="{BODY}" fill="{bf}"/>{eyes_g(ef)}'))

    # 2. Breathe: the outline eases from a circle to its six waves and back, like a slow breath.
    flat, full = body(0), body(A)
    out['breathe'] = ('Breathe', 'Circle to waves and back. Calm, for long waits.', doc(
        '.all{animation:b 2.8s ease-in-out infinite}@keyframes b{0%,100%{transform:scale(.94)}50%{transform:scale(1)}}',
        f'<g class="all"><path d="{flat}" fill="{bf}"><animate attributeName="d" dur="2.8s" repeatCount="indefinite" '
        f'values="{flat};{full};{flat}" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/></path>'
        f'{eyes_g(ef)}</g>'))

    # 3. Glance: the eyes look left, right, then blink. Reads as "thinking about it".
    out['glance'] = ('Glance', 'Looks left, looks right, blinks. For "thinking".', doc(
        '.eyes{animation:look 3.2s ease-in-out infinite}'
        '@keyframes look{0%,12%{transform:translate(0,0)}22%,40%{transform:translate(-9px,1px)}'
        '50%,68%{transform:translate(9px,-1px)}78%,100%{transform:translate(0,0)}}'
        '.eye{animation:blink 3.2s infinite}'
        '@keyframes blink{0%,84%,92%,100%{transform:scaleY(1)}88%{transform:scaleY(.1)}}',
        f'<path d="{BODY}" fill="{bf}"/>{eyes_g(ef)}'))

    # 4. Chatter: the two quote marks hop one after the other, like a typing indicator.
    out['chatter'] = ('Chatter', 'The quote marks hop in turn. For "sending".', doc(
        '.eye{animation:hop 1.1s cubic-bezier(.3,0,.3,1) infinite}.e2{animation-delay:.18s}'
        '@keyframes hop{0%,55%,100%{transform:translateY(0)}25%{transform:translateY(-12px)}}'
        '.body{animation:squash 1.1s ease-in-out infinite}'
        '@keyframes squash{0%,100%{transform:scale(1,1)}30%{transform:scale(1.02,.98)}}',
        f'<path class="body" d="{BODY}" fill="{bf}"/>{eyes_g(ef)}'))

    # 5. Trace: the outline draws itself, fills, the eyes pop in, then it all lets go.
    out['trace'] = ('Trace', 'Draws the outline, fills, opens its eyes. For first load.', doc(
        f'.line{{fill:none;stroke:{bf};stroke-width:7;stroke-linecap:round;stroke-dasharray:1;animation:draw 3s ease-in-out infinite}}'
        '@keyframes draw{0%{stroke-dashoffset:1}40%,85%{stroke-dashoffset:0}100%{stroke-dashoffset:-1}}'
        '.fill{animation:fill 3s ease-in-out infinite}'
        '@keyframes fill{0%,35%{opacity:0}50%,80%{opacity:1}92%,100%{opacity:0}}'
        '.eye{animation:pop 3s cubic-bezier(.3,1.6,.5,1) infinite backwards}.e2{animation-delay:.08s}'
        '@keyframes pop{0%,48%{transform:scale(0)}58%,78%{transform:scale(1)}88%,100%{transform:scale(0)}}',
        f'<path class="fill" d="{BODY}" fill="{bf}"/><path class="line" d="{BODY}" pathLength="1"/>{eyes_g(ef)}'))

    # 6. Crests: the six wave crests light up in turn around the face, like a classic dot spinner.
    crest = []
    for k in range(N):
        t = math.pi/12 + k*math.pi/3          # sin(6t) = 1: the tip of each wave
        x, y = 100 + (R + A + 13)*math.cos(t), 100 + (R + A + 13)*math.sin(t)
        crest.append(f'<circle class="dot" cx="{x:.2f}" cy="{y:.2f}" r="6" fill="{ACC}" style="animation-delay:{k*0.2:.1f}s"/>')
    out['crests'] = ('Crests', 'A light runs round the six waves. For progress.', doc(
        '.dot{opacity:.15;animation:lit 1.2s linear infinite}@keyframes lit{0%{opacity:1}60%,100%{opacity:.15}}'
        '.all{transform:scale(.84)}',
        f'<g class="all"><path d="{BODY}" fill="{bf}"/>{eyes_g(ef)}{"".join(crest)}</g>'))

    return out

def trio(bf, ef):
    # 7. Trio: three small marks bounce in a row, a branded "…" for inline and chat use. Wide, not square.
    one = f'<path d="{BODY}" fill="{bf}"/>' + eyes(ef)
    g = ''.join(f'<g transform="translate({i*220} 0)"><g class="m" style="animation-delay:{i*0.15:.2f}s">{one}</g></g>' for i in range(3))
    return ('Trio', 'Three marks bounce, a branded "…". Inline and chat.', (
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 -40 640 240" role="img" aria-label="Loading">'
        '<style>svg *{transform-box:view-box}.m{transform-origin:100px 180px;animation:bounce 1.2s cubic-bezier(.3,0,.3,1) infinite}'
        '@keyframes bounce{0%,60%,100%{transform:translateY(0) scale(1,1)}30%{transform:translateY(-36px) scale(.96,1.04)}}'
        '@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>'
        f'{g}</svg>\n'))

variants = {'': (DEEP, W), '-on-dark': (ACC, DEEP)}
os.makedirs('brand/svg/loaders', exist_ok=True)
cards = {}
for suffix, (bf, ef) in variants.items():
    items = loaders(bf, ef); items['trio'] = trio(bf, ef)
    for name, (title, note, svg) in items.items():
        open(f'brand/svg/loaders/heresay-loader-{name}{suffix}.svg', 'w').write(svg)
        cards.setdefault(name, (title, note))

# The dashboard's loader.
open('public/loader.svg', 'w').write(loaders(DEEP, W)['glance'][2])

# Preview page: every loader on white and on ink, at a hero size and at button size.
def card(name, title, note):
    wide = name == 'trio'
    def img(sfx, h): return f'<img src="svg/loaders/heresay-loader-{name}{sfx}.svg" style="height:{h}px" alt="">'
    return (f'<figure><div class="pair"><div class="light">{img("", 44 if wide else 120)}</div>'
            f'<div class="dark">{img("-on-dark", 44 if wide else 120)}</div></div>'
            f'<div class="small"><button>{img("", 18)} Sending</button><span>{img("", 28)}</span><span>{img("", 16)}</span></div>'
            f'<figcaption><b>{title}</b> {note}<code>heresay-loader-{name}.svg</code></figcaption></figure>')

html = f'''<!doctype html><meta charset="utf-8"><title>Heresay loaders</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Figtree:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
body{{margin:0;padding:56px 48px;background:#fff;color:{INK};font:15px/1.5 Figtree,system-ui,sans-serif}}
h1{{font:800 40px/1 "Bricolage Grotesque",sans-serif;color:{DEEP};margin:0 0 6px;letter-spacing:-.02em}}
p.lede{{color:{SLATE};margin:0 0 40px}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:28px}}
figure{{margin:0;border:1px solid {LINE};border-radius:18px;overflow:hidden}}
.pair{{display:grid;grid-template-columns:1fr 1fr}}
.pair>div{{height:180px;display:grid;place-items:center}}
.dark{{background:{INK}}}
.small{{display:flex;gap:18px;align-items:center;padding:14px 18px;border-top:1px solid {LINE};background:{PAPER}}}
.small img{{display:block}}
button{{display:inline-flex;gap:8px;align-items:center;font:600 14px Figtree,sans-serif;background:#fff;color:{INK};border:1px solid {LINE};border-radius:999px;padding:7px 14px}}
figcaption{{padding:14px 18px 18px;color:{SLATE}}}
figcaption b{{color:{INK};margin-right:4px}}
code{{display:block;margin-top:6px;font:12px "JetBrains Mono",monospace;color:{DEEP}}}
</style>
<h1>Loading, with a face</h1>
<p class="lede">Seven loaders built from the exact mark geometry. Each is one animated SVG, in a peacock and an on-dark version; all hold still under reduced motion.</p>
<main>{"".join(card(n, *tn) for n, tn in cards.items())}</main>
'''
open('brand/heresay-loaders.html', 'w').write(html)
print(len(cards)*len(variants), 'loaders')
