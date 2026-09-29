# 0003: The Heresay brand system

Date: 2026-09-28

- **Mark:** a soft six-wave shape (radius R, waves ±R/8) with two quotation marks as eyes, tilted
  up. A quote with a face. Geometry lives in `scripts/brand_geometry.py`; never redraw by hand.
- **Colour:** Deep Peacock `#0b5e57` (brand), Peacock `#0f766e` (actions, widget default),
  Turquoise `#2dd4bf` (fill only; dark mode), on white and neutral greys. Chosen because it is not
  a status colour and is rare as an app brand, so it sits politely in other people's apps.
- **Type:** Bricolage Grotesque (headlines, wordmark, 700/800), Figtree (UI and body), JetBrains
  Mono (code). All free on Google Fonts.
- **Widget:** neutral; peacock only on Send, selection and the update dot; `data-accent` lets the
  host swap it. The mark on the button keeps its own colour.
- **Files:** `brand/svg/`, `brand/png/`, `brand/heresay-brand-guidelines.pdf` (Illustrator opens
  it as one artboard per page). Regenerate with `scripts/brand_assets.py` and
  `scripts/brand_guidelines.py`.
- **Site:** `/` product page, `/docs.html` developer docs, `/app/` dashboard.
