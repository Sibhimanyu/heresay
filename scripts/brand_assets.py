"""Write the Heresay logo files into brand/svg and public/."""
import sys; sys.path.insert(0, 'scripts')
from brand_geometry import *
def doc(w, h, inner, bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.2f} {h:.2f}">{b}{inner}</svg>\n'
files = {
 'heresay-mark.svg': doc(200, 200, mark(DEEP, W)),
 'heresay-mark-accent.svg': doc(200, 200, mark(DEEP, ACC)),
 'heresay-mark-on-dark.svg': doc(200, 200, mark(ACC, DEEP)),
 'heresay-mark-ink.svg': doc(200, 200, mark(INK, W)),
 'heresay-mark-white.svg': doc(200, 200, f'<path d="{BODY}" fill="#fff"/>' + eyes(DEEP)),
}
wm, ww = wordmark(DEEP, 100); files['heresay-wordmark.svg'] = doc(ww, 125, wm)
wm, ww = wordmark(W, 100); files['heresay-wordmark-white.svg'] = doc(ww, 125, wm)
lk, lw, lh = lockup(); files['heresay-logo.svg'] = doc(lw, lh, lk)
lk, lw, lh = lockup(W, DEEP, W); files['heresay-logo-white.svg'] = doc(lw, lh, lk)
# Stacked: mark over wordmark.
wm, ww = wordmark(DEEP, 70); files['heresay-logo-stacked.svg'] = doc(max(ww, 200), 200 + 40 + 88, f'<g transform="translate({(max(ww,200)-200)/2} 0)">{mark()}</g><g transform="translate({(max(ww,200)-ww)/2} 240)">{wm}</g>')
# App icon: deep tile, white mark. Small-size artwork draws the mark larger so the eyes stay open.
files['heresay-app-icon.svg'] = doc(1024, 1024, f'<rect width="1024" height="1024" rx="228" fill="{DEEP}"/><g transform="translate(212 212) scale(3)">{mark(W, DEEP)}</g>')
files['heresay-app-icon-small.svg'] = doc(1024, 1024, f'<rect width="1024" height="1024" rx="228" fill="{DEEP}"/><g transform="translate(112 112) scale(4)">{mark(W, DEEP)}</g>')
for n, s in files.items(): open(f'brand/svg/{n}', 'w').write(s)
open('public/favicon.svg', 'w').write(files['heresay-mark.svg'])
open('public/mark.svg', 'w').write(files['heresay-mark.svg'])
open('public/logo.svg', 'w').write(files['heresay-logo.svg'])
open('public/logo-white.svg', 'w').write(files['heresay-logo-white.svg'])
open('public/app-icon.svg', 'w').write(files['heresay-app-icon.svg'])
print(len(files), 'files')
