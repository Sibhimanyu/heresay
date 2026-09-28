"""Heresay brand guidelines: HTML pages rendered to a multi-page vector PDF (opens in Illustrator, one artboard per page)."""
import sys, math; sys.path.insert(0, 'scripts')
from brand_geometry import *
def svg(inner, w=200, h=200, size=None, extra=''):
    sz = f'width="{size}" height="{size*h/w:.0f}"' if size else ''
    return f'<svg {sz} viewBox="0 0 {w} {h}" {extra}>{inner}</svg>'
M = lambda b=DEEP, e=W, size=None: svg(mark(b, e), size=size)
lk, lw, lh = lockup(); LOCK = lambda size: svg(lk, lw, lh, size)
lkw, _, _ = lockup(W, DEEP, W); LOCKW = lambda size: svg(lkw, lw, lh, size)
TOTAL = 14
def page(n, kicker, title, lede, body, dark=False):
    cls = 'page dark' if dark else 'page'
    return (f'<section class="{cls}"><div class="kicker">{n:02d} · {kicker}</div><h1>{title}</h1>'
            f'<p class="lede">{lede}</p><div class="body">{body}</div>'
            f'<footer><span>Heresay · Brand guidelines · v1.0 · September 2026</span><span>{n:02d} / {TOTAL}</span></footer></section>')
P = []
# 01 cover
P.append(f'''<section class="page cover"><div class="cover-mark">{M(W, DEEP)}</div><div class="cover-text"><div class="cover-word">{svg(wordmark(W, 100)[0], wordmark(W,100)[1], 125)}</div>
<p>Brand guidelines</p><p class="small">The mark, its construction and colour, type, the widget, voice, and how to use them. Version 1.0, September 2026.</p></div>
<footer><span>Heresay · Brand guidelines · v1.0 · September 2026</span><span>01 / {TOTAL}</span></footer></section>''')
# 02 idea
P.append(page(2, 'The idea', 'Every report gets a hearing.', 'Heresay puts a Report button in any app. Users say what is wrong, the developer rules on it, and the user hears back. The brand is built on that one promise.',
 f'''<div class="cols3"><div class="card"><div class="big">Here, say it.</div><p>Read the name one way: an invitation. Here is the place. Say it.</p></div>
 <div class="card"><div class="big"><s>hearsay</s> → firsthand</div><p>Hear it the other way: hearsay is secondhand talk. Heresay is the opposite, straight from the person using the app.</p></div>
 <div class="card"><div class="big">{M(size=72)}</div><p>The mark is a quote with a face. The quotation marks are eyes, looking up at whoever is speaking.</p></div></div>'''))
# 03 construction
cx = f'''<g opacity=".9"><circle cx="100" cy="100" r="{R}" fill="none" stroke="{ACC}" stroke-width=".8" stroke-dasharray="3 3"/>
<circle cx="100" cy="100" r="{R+A}" fill="none" stroke="#c9ced6" stroke-width=".6"/><circle cx="100" cy="100" r="{R-A}" fill="none" stroke="#c9ced6" stroke-width=".6"/>
<line x1="100" y1="10" x2="100" y2="190" stroke="#c9ced6" stroke-width=".5"/><line x1="10" y1="100" x2="190" y2="100" stroke="#c9ced6" stroke-width=".5"/>
{''.join(f'<line x1="100" y1="100" x2="{100+95*math.cos(math.radians(a)):.1f}" y2="{100+95*math.sin(math.radians(a)):.1f}" stroke="#e3e6ea" stroke-width=".5"/>' for a in range(0,360,30))}</g>'''
P.append(page(3, 'Construction', 'One circle, six waves, two quotes.', 'Everything is measured from R, the radius of the base circle. The waves rise and fall by R/8. The eyes are the brand quotation mark, drawn at 1.25 and tilted 24° upward.',
 f'''<div class="split"><div class="figure">{svg(f'<g opacity=".25">{mark()}</g>' + cx + f'<g opacity=".95">{eyes(DEEP)}</g>', size=460)}</div>
 <table class="spec"><tr><td>R</td><td>Base circle radius · 74 units in a 200 box</td></tr><tr><td>Waves</td><td>6 around the circle, depth ± R/8</td></tr>
 <tr><td>Eyes</td><td>Two quotation marks, scale 1.25, tilted −24°, centres at (80, 106) and (124, 101)</td></tr><tr><td>Glance</td><td>Right eye sits 5 units higher: the face looks up and slightly right</td></tr>
 <tr><td>Colour</td><td>Body Deep Peacock, eyes White</td></tr><tr><td>Source</td><td><code>scripts/brand_geometry.py</code> · never redraw by hand</td></tr></table></div>'''))
# 04 versions
V = [('Colour', M(), '#fff', 'On white and light grounds. The default.'), ('Accent eyes', M(DEEP, ACC), '#fff', 'Where a touch of brightness helps: stickers, launch art.'),
     ('On dark', M(ACC, DEEP), INK, 'Dark grounds and dark mode.'), ('Reversed', M(W, DEEP), DEEP, 'On Deep Peacock: app icon, headers.'), ('One colour', M(INK, W), '#fff', 'Print, fax, embossing: anywhere colour cannot hold.')]
P.append(page(4, 'Versions', 'Five versions, one face.', 'Use the colour mark wherever you can. The others exist for grounds and processes where it will not hold.',
 '<div class="cols5">' + ''.join(f'<div class="ver"><div class="tile" style="background:{bg}">{m}</div><b>{n}</b><p>{d}</p></div>' for n, m, bg, d in V) + '</div>'))
# 05 clear space & min size
P.append(page(5, 'Clear space and size', 'Give it room to breathe.', 'Keep clear space of at least one eye-width (x) on every side. Nothing enters it: no text, no edges, no other marks.',
 f'''<div class="split"><div class="figure">{svg(f'<rect x="-20" y="-20" width="240" height="240" fill="{SOFT}"/><rect x="0" y="0" width="200" height="200" fill="#fff"/>{mark()}'
 + ''.join(f'<rect x="{x}" y="{y}" width="20" height="20" fill="none" stroke="{PEACOCK}" stroke-width=".8" stroke-dasharray="2 2"/><text x="{x+10}" y="{y+13}" font-size="8" text-anchor="middle" fill="{PEACOCK}">x</text>' for x, y in [(-20,-20),(200,-20),(-20,200),(200,200)]), 240, 240, 420, 'style="overflow:visible"')}</div>
 <div><h3>Minimum size</h3><div class="sizes">{''.join(f'<div>{M(size=s)}<small>{s} px</small></div>' for s in (64, 48, 32, 24, 16))}</div>
 <p>Screen: 16 px. Print: 6 mm. Below 24 px, use the small-size artwork, which is drawn larger inside its tile so the eyes stay open.</p></div></div>'''))
# 06 colour
C = [('Deep Peacock', DEEP, W, 'The brand. Mark body, headlines, dark tiles.', '7.6:1 on white'), ('Peacock', PEACOCK, W, 'Actions: buttons, selected states, the widget accent.', '5.5:1 on white'),
     ('Turquoise', ACC, INK, 'Fill only, never text on white. Eyes, dark-mode accent.', '9.5:1 on ink'), ('Mist', SOFT, INK, 'Tints behind peacock content.', '—'),
     ('Ink', INK, W, 'Text and dark surfaces.', '17.9:1 on white'), ('Slate', SLATE, W, 'Secondary text.', '6.0:1 on white'), ('Line', LINE, INK, 'Hairlines and borders.', '—'), ('Paper', PAPER, INK, 'Light surfaces.', '—')]
S = [('Heard', '#eef0f3', '#2a2e36'), ('Sustained', '#dcf1e6', '#17704a'), ('Overruled', '#f7ead3', '#855309'), ('Case closed', SOFT, DEEP)]
P.append(page(6, 'Colour', 'Peacock, and a lot of white.', 'One brand colour family on neutral grounds. It is not a status colour, so it never reads as an error or a success inside someone else\'s app.',
 '<div class="swatches">' + ''.join(f'<div class="sw" style="background:{bg};color:{fg};{"border:1px solid #e3e6ea" if bg in (SOFT, LINE, PAPER) else ""}"><b>{n}</b><span>{d}</span><code>{bg} · {c}</code></div>' for n, bg, fg, d, c in C)
 + '</div><div class="pills">' + ''.join(f'<span class="pill" style="background:{b};color:{f}"><i></i>{n}</span>' for n, b, f in S) + '<span class="note">Status colours: green for yes, amber for a considered no. Never red: a declined report is an answer, not an error.</span></div>'))
# 07 typography
P.append(page(7, 'Typography', 'Warm headlines, quiet text.', 'Three families, each with one job. All free on Google Fonts, so developers and the web can use them without a licence.',
 '''<div class="cols3 type"><div class="card"><div class="spec-bricolage">Aa</div><b>Bricolage Grotesque</b><p>Headlines and the wordmark. ExtraBold 800 and Bold 700. Its soft, slightly quirky shapes match the wavy mark.</p></div>
 <div class="card"><div class="spec-figtree">Aa</div><b>Figtree</b><p>Interface and body text. 400 to 700. Friendly, very legible at small sizes.</p></div>
 <div class="card"><div class="spec-mono">&lt;/&gt;</div><b>JetBrains Mono</b><p>Code, keys, routes and versions. 400 and 500.</p></div></div>
 <div class="scale"><div><span>Display</span><b style="font:800 56px/1.05 'Bricolage Grotesque'">Every report gets a hearing.</b><small>56 / 1.05 · 800 · −0.03em</small></div>
 <div><span>Heading</span><b style="font:700 32px/1.2 'Bricolage Grotesque'">How it works</b><small>32 / 1.2 · 700</small></div>
 <div><span>Body</span><b style="font:400 17px/1.6 Figtree">Add one line to any app. Your users say what is wrong, you rule on it, and they hear back.</b><small>17 / 1.6 · 400</small></div>
 <div><span>Code</span><b style="font:400 14px/1.6 'JetBrains Mono'">&lt;script src="https://heresay.dev/sdk.js" data-key="pk_…"&gt;</b><small>14 / 1.6 · 400</small></div></div>'''))
# 08 lockups
P.append(page(8, 'Wordmark and lockups', 'With the name.', 'The wordmark is Bricolage Grotesque ExtraBold, lowercase, tracked in slightly, outlined. The mark is twice the height of the h; the gap is 0.18 of the mark.',
 f'''<div class="cols2"><div class="tile wide" style="background:#fff">{LOCK(520)}</div><div class="tile wide" style="background:{DEEP}">{LOCKW(520)}</div></div>
 <div class="cols2" style="margin-top:20px"><div class="tile wide" style="background:#fff">{svg(open('brand/svg/heresay-logo-stacked.svg').read().split('>',1)[1].rsplit('</svg>',1)[0], max(wordmark(DEEP,70)[1],200), 328, 180)}<p class="cap">Stacked, for square spaces</p></div>
 <div class="tile wide" style="background:#fff"><div style="width:520px">{svg(wordmark(DEEP, 100)[0], wordmark(DEEP,100)[1], 125, 360)}</div><p class="cap">Wordmark alone, where the mark already appears nearby</p></div></div>'''))
# 09 app icon
P.append(page(9, 'App icon and favicon', 'On the home screen.', 'The reversed mark on a Deep Peacock tile. At 32 px and below, the small-size artwork draws the mark larger so the eyes stay readable.',
 f'''<div class="split"><div class="figure">{svg(open('brand/svg/heresay-app-icon.svg').read().split('>',1)[1].rsplit('</svg>',1)[0], 1024, 1024, 380)}<p class="cap">1024 canvas · corner radius 228 · mark 600 wide</p></div>
 <div class="icons">{''.join(f'<div>{svg(open("brand/svg/heresay-app-icon" + ("-small" if s <= 32 else "") + ".svg").read().split(">",1)[1].rsplit("</svg>",1)[0], 1024, 1024, s)}<small>{s}</small></div>' for s in (256, 128, 64, 32, 16))}</div></div>'''))
# 10 widget
P.append(page(10, 'In other people\'s apps', 'A guest in someone else\'s house.', 'The widget lives inside other brands. It stays neutral, black and white, and uses peacock only where it matters. Developers can swap the accent for their own colour.',
 f'''<div class="split"><div class="host"><div class="bar"></div><div class="bar short"></div>
 <div class="panel"><div class="tabs"><span class="on">Report</span><span>Your reports</span></div><div class="chips"><span>Broken</span><span class="on">Confusing</span><span>Could be better</span><span>Idea</span></div>
 <div class="field">I can't find where to cancel my plan.</div><div class="row"><small>Screen and version attached</small><span class="send">Send</span></div></div>
 <div class="fab">{M(size=22)}<b>Report</b></div></div>
 <table class="spec"><tr><td>Neutral</td><td>White panel, ink text, slate hints. Nothing competes with the host's brand.</td></tr>
 <tr><td>Accent</td><td>Peacock on Send, the selected type and the update dot only.</td></tr><tr><td>Override</td><td><code>data-accent="#hex"</code> replaces peacock. The mark on the button stays as drawn.</td></tr>
 <tr><td>Dark</td><td>Follows the device: ink panel, Turquoise accent.</td></tr><tr><td>Words</td><td>Plain in the widget: Waiting, Accepted, Fixed, Declined with a reason.</td></tr></table></div>'''))
# 11 UI
P.append(page(11, 'Interface', 'The parts.', 'Rounded, soft and calm, like the mark. Radius 10 on controls, 16 on cards. Spacing on a 4-point grid.',
 f'''<div class="ui"><div class="card"><h3>Buttons</h3><span class="btn p">Get your one line</span> <span class="btn s">See how it works</span> <span class="btn g">Cancel</span></div>
 <div class="card"><h3>Report types</h3><div class="chips"><span>Broken</span><span class="on">Confusing</span><span>Could be better</span><span>Idea</span></div><p>Reporters pick what they can judge. They never pick a priority.</p></div>
 <div class="card"><h3>Statuses · dashboard</h3><div class="pills">{"".join(f'<span class="pill" style="background:{b};color:{f}"><i></i>{n}</span>' for n, b, f in S)}</div><p>The court words live in the dashboard. A decline is always a ruling with a reason.</p></div>
 <div class="card"><h3>The brief</h3><div class="brief"><b>BRIEF · SUSTAINED</b><br>Type: broken · /export · v1.4.0<br>"""<br>The export button does nothing.<br>"""</div><p>Only sustained reports ever become a brief for a coding agent.</p></div></div>'''))
# 12 voice
P.append(page(12, 'Voice', 'Plain first, pun second.', 'We sound like a helpful person, not a courtroom. The legal wordplay is a wink, used where it fits exactly and never at a user\'s expense.',
 '''<div class="cols2 voice"><div class="card"><h3 class="ok">Say</h3><p class="say">"Here, say it."</p><p class="say">"Heard. We'll get back to you."</p><p class="say">"Declined: it's under Settings → Plan."</p><p class="say">"Every report gets a hearing."</p></div>
 <div class="card"><h3 class="no">Don't</h3><p class="say">A pun in an error message</p><p class="say">Jokes inside a decline</p><p class="say">"Your objection is inadmissible"</p><p class="say">Urgency theatre: "CRITICAL!!"</p></div></div>'''))
# 13 misuse
mis = [('Don\'t stretch it', f'<g transform="scale(1.35 .8) translate(-26 25)">{mark()}</g>'), ('Don\'t rotate it', f'<g transform="rotate(35 100 100)">{mark()}</g>'),
       ('Don\'t recolour it red', mark('#e5484d', W)), ('Don\'t outline it', f'<path d="{BODY}" fill="none" stroke="{DEEP}" stroke-width="6"/>' + eyes(DEEP)),
       ('Don\'t remove the eyes', f'<path d="{BODY}" fill="{DEEP}"/>'), ('Don\'t swap the eyes', f'<path d="{BODY}" fill="{DEEP}"/><circle cx="80" cy="100" r="12" fill="#fff"/><circle cx="122" cy="96" r="12" fill="#fff"/>'),
       ('Don\'t add effects', f'<defs><linearGradient id="gx" x1="0" x2="1"><stop offset="0" stop-color="{ACC}"/><stop offset="1" stop-color="#6b4fa8"/></linearGradient></defs><path d="{BODY}" fill="url(#gx)"/>' + eyes(W)),
       ('Don\'t use low contrast', mark('#9fd9cf', '#bfe8e1'))]
P.append(page(13, 'Misuse', 'Please don\'t.', 'The mark only works as drawn. Each of these breaks the face, the colour or the promise.',
 '<div class="cols4">' + ''.join(f'<div class="ver"><div class="tile" style="background:#fff">{svg(m, size=120)}</div><p class="bad">✕ {n}</p></div>' for n, m in mis) + '</div>'))
# 14 files
P.append(page(14, 'Files', 'Where everything lives.', 'Everything is generated from one geometry file. Start from the source, never redraw.',
 '''<table class="files"><tr><td>brand/svg/heresay-mark*.svg</td><td>The mark: colour, accent eyes, on dark, one colour, white</td></tr><tr><td>brand/svg/heresay-logo*.svg</td><td>Horizontal and stacked lockups, colour and white</td></tr>
 <tr><td>brand/svg/heresay-wordmark*.svg</td><td>The outlined wordmark</td></tr><tr><td>brand/svg/heresay-app-icon*.svg</td><td>The app icon, regular and small-size artwork</td></tr>
 <tr><td>brand/png/</td><td>1024 app icon and 32 px favicon PNGs</td></tr><tr><td>brand/heresay-brand-guidelines.pdf</td><td>This document. Opens in Illustrator with one artboard per page.</td></tr>
 <tr><td>scripts/brand_geometry.py</td><td>The source of truth: mark construction, wordmark outlines, lockup spacing</td></tr><tr><td>scripts/brand_assets.py · brand_guidelines.py</td><td>Regenerate the files and this document</td></tr></table>'''))
CSS = f'''@page {{ size: 1600px 1000px; margin: 0 }} * {{ box-sizing:border-box }} body {{ margin:0; font:17px/1.6 Figtree, system-ui, sans-serif; color:{INK} }}
.page {{ width:1600px; height:1000px; padding:72px 88px; position:relative; page-break-after:always; overflow:hidden; background:#fff }}
.kicker {{ font:600 14px 'JetBrains Mono', monospace; color:{PEACOCK}; letter-spacing:.06em }} h1 {{ font:800 56px/1.08 'Bricolage Grotesque'; letter-spacing:-.03em; margin:10px 0 0 }}
.lede {{ font-size:19px; color:{SLATE}; max-width:62ch; margin:14px 0 36px }} .body {{ }} footer {{ position:absolute; left:88px; right:88px; bottom:36px; display:flex; justify-content:space-between; font:500 13px 'JetBrains Mono'; color:#8b93a1 }}
.cover {{ background:{DEEP}; color:#fff; display:flex; align-items:center; gap:72px }} .cover-mark svg {{ width:420px; height:420px }} .cover-word svg {{ width:560px }} .cover p {{ font:600 28px Figtree; margin:24px 0 0 }} .cover .small {{ font:400 17px/1.6 Figtree; color:#b9dcd6; max-width:44ch }} .cover footer {{ color:#8fc1b8 }}
.cols2 {{ display:grid; grid-template-columns:1fr 1fr; gap:20px }} .cols3 {{ display:grid; grid-template-columns:repeat(3,1fr); gap:20px }} .cols4 {{ display:grid; grid-template-columns:repeat(4,1fr); gap:20px }} .cols5 {{ display:grid; grid-template-columns:repeat(5,1fr); gap:18px }}
.card {{ background:{PAPER}; border-radius:16px; padding:28px }} .card p {{ color:{SLATE}; margin:10px 0 0 }} .big {{ font:800 34px/1.2 'Bricolage Grotesque'; min-height:84px }} .big s {{ color:#9aa1ad }}
.split {{ display:grid; grid-template-columns:auto 1fr; gap:64px; align-items:center }} .figure {{ text-align:center }}
table.spec, table.files {{ border-collapse:collapse; width:100% }} .spec td, .files td {{ padding:14px 0; border-bottom:1px solid {LINE}; vertical-align:top }} .spec td:first-child {{ font-weight:700; width:120px; color:{DEEP} }} .files td:first-child {{ font:500 15px 'JetBrains Mono'; width:520px; color:{DEEP} }}
code {{ font:14px 'JetBrains Mono'; background:{SOFT}; padding:2px 6px; border-radius:5px; color:{DEEP} }}
.ver .tile {{ height:240px; border-radius:16px; border:1px solid {LINE}; display:flex; align-items:center; justify-content:center }} .ver .tile svg {{ width:150px }} .ver b {{ display:block; margin-top:12px }} .ver p {{ margin:4px 0 0; color:{SLATE}; font-size:15px }} .ver .bad {{ color:#b42318; font-weight:600 }}
.cols4 .ver .tile {{ height:200px }}
.sizes {{ display:flex; gap:28px; align-items:flex-end; margin:18px 0 }} .sizes div {{ text-align:center }} .sizes small, .icons small {{ display:block; color:{SLATE}; font:13px 'JetBrains Mono'; margin-top:6px }} h3 {{ font:700 22px 'Bricolage Grotesque'; margin:0 0 8px }}
.swatches {{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px }} .sw {{ border-radius:16px; height:190px; padding:20px; display:flex; flex-direction:column }} .sw b {{ font-size:18px }} .sw span {{ font-size:14px; flex:1; opacity:.9; margin-top:4px }} .sw code {{ background:transparent; padding:0; color:inherit; opacity:.85; font-size:13px }}
.pills {{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:22px }} .pill {{ border-radius:999px; padding:8px 16px; font-weight:600; font-size:15px; display:inline-flex; gap:8px; align-items:center }} .pill i {{ width:8px; height:8px; border-radius:50%; background:currentColor }} .note {{ color:{SLATE}; font-size:14px; margin-left:8px }}
.type .card {{ min-height:250px }} .spec-bricolage {{ font:800 96px/1 'Bricolage Grotesque' }} .spec-figtree {{ font:600 96px/1 Figtree }} .spec-mono {{ font:500 80px/1.2 'JetBrains Mono'; color:{DEEP} }}
.scale {{ margin-top:26px; display:grid; gap:10px }} .scale div {{ display:grid; grid-template-columns:120px 1fr 220px; align-items:baseline; border-top:1px solid {LINE}; padding-top:10px }} .scale span {{ font:600 13px 'JetBrains Mono'; color:{PEACOCK} }} .scale small {{ font:13px 'JetBrains Mono'; color:{SLATE}; text-align:right }}
.tile.wide {{ height:300px; border-radius:16px; border:1px solid {LINE}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px }} .cap {{ color:{SLATE}; font-size:14px; margin:8px 0 0 }}
.icons {{ display:flex; gap:32px; align-items:flex-end }} .icons div {{ text-align:center }}
.host {{ width:640px; height:520px; border:1px solid {LINE}; border-radius:16px; background:{PAPER}; position:relative; padding:28px }} .bar {{ height:14px; width:60%; background:#e9ecf1; border-radius:7px; margin-bottom:12px }} .bar.short {{ width:40% }}
.panel {{ position:absolute; right:28px; bottom:96px; width:360px; background:#fff; border:1px solid {LINE}; border-radius:14px; padding:16px; box-shadow:0 12px 30px rgba(21,23,28,.12) }}
.tabs {{ display:flex; gap:4px; margin-bottom:12px }} .tabs span {{ padding:6px 12px; border-radius:8px; font-weight:600; font-size:14px; color:{SLATE} }} .tabs .on {{ background:#eef0f3; color:{INK} }}
.chips {{ display:flex; gap:6px; flex-wrap:wrap }} .chips span {{ border:1.5px solid {LINE}; border-radius:10px; padding:6px 11px; font-size:13px; font-weight:600 }} .chips .on {{ border-color:{PEACOCK}; background:{SOFT} }}
.field {{ border:1.5px solid {LINE}; border-radius:10px; padding:9px 11px; margin-top:10px; font-size:14px; min-height:54px }} .row {{ display:flex; justify-content:space-between; align-items:center; margin-top:10px }} .row small {{ color:{SLATE}; font-size:12px }}
.send {{ background:{PEACOCK}; color:#fff; border-radius:10px; padding:8px 16px; font-weight:700; font-size:14px }} .fab {{ position:absolute; right:28px; bottom:28px; background:#fff; border:1px solid {LINE}; border-radius:999px; padding:8px 16px 8px 10px; display:flex; gap:8px; align-items:center; box-shadow:0 4px 14px rgba(0,0,0,.12) }}
.ui {{ display:grid; grid-template-columns:1fr 1fr; gap:20px }} .btn {{ display:inline-block; border-radius:10px; padding:12px 20px; font-weight:700; margin:6px 6px 0 0 }} .btn.p {{ background:{PEACOCK}; color:#fff }} .btn.s {{ border:1.5px solid #cfd3db }} .btn.g {{ color:{SLATE} }}
.brief {{ background:#fff; border:1px solid {LINE}; border-radius:12px; padding:14px; font:14px/1.6 'JetBrains Mono'; color:#2a2e36 }} .brief b {{ color:{DEEP}; font-family:Figtree }}
.voice .say {{ font:700 24px/1.3 'Bricolage Grotesque'; color:{INK}; border-top:1px solid {LINE}; padding-top:12px; margin:12px 0 0 }} .ok {{ color:#17704a }} .no {{ color:#b42318 }}'''
html = ('<!doctype html><html><head><meta charset="utf-8"><title>Heresay brand guidelines</title>'
        '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">'
        f'<style>{CSS}</style></head><body>' + ''.join(P) + '</body></html>')
open('brand/heresay-brand-guidelines.html', 'w').write(html)
print(len(P), 'pages')
