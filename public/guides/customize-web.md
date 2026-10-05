# Change how Heresay looks in a web app

Goal: the Report button fits the app, with the fewest changes. **The defaults are the
recommended setup.** Change something only when the person asks, or when the app clearly needs
it (see "When to change what"). Every option is a `data-` attribute on the same script tag;
nothing needs CSS, and the app's CSS can't reach the widget anyway.

The easiest way to choose is the dashboard: open the app, then **Design**. It shows the real
widget with the choices applied and gives the exact tag, plus a prompt for you. If the person
pasted that prompt, do what it says and nothing more.

## When to change what

| The app has... | Do this |
| --- | --- |
| Its own "Send feedback" or help menu | `data-button="none"`, and make that menu item call `window.Heresay?.open()` |
| A chat bubble or cookie banner in the bottom right | `data-position="left"`, or `data-offset="20,96"` to sit above it |
| A brand colour | `data-accent="#rrggbb"` (the logo follows it) |
| Only a dark theme, or only a light one | `data-theme="dark"` or `"light"`; otherwise leave it following the device |
| French, Tamil or Hindi users | nothing, if `<html lang>` is set (`fr`, `ta`, `hi`); otherwise `data-lang` with that code, or `"auto"` |
| An error screen or "Something went wrong" page | a button there that calls `window.Heresay?.open({ type: 'broken', text: '<what failed>' })` |
| Pages where a floating button gets in the way (checkout, login) | `data-hide-on="/checkout,/login"` |

## Every option

The first value is the default.

**The button**

| Attribute | Values |
| --- | --- |
| `data-position` | `right` · `left` · `top-right` · `top-left` · `center` (bottom centre) |
| `data-offset` | `20` · any number of px, or `x,y` like `24,96` (at most 400) |
| `data-button` | `always` · `none` (no button; open it yourself) · `desktop` (not on phones) · `scroll` (after the first scroll; after 10 s on a page that doesn't scroll) |
| `data-label` | `Report` · any text up to 40 characters, e.g. `Feedback` |
| `data-style` | `pill` · `icon` (icon only; the label stays as its accessible name) · `tab` (on the side edge) |
| `data-size` | `regular` · `small` · `large` |
| `data-fill` | `neutral` · `accent` (filled with the accent colour) |
| `data-shadow` | `soft` · `none` · `strong` |
| `data-hide-on` | comma-separated paths; each hides the button on that path and everything under it |

**Look**

| Attribute | Values |
| --- | --- |
| `data-accent` | Heresay peacock · any hex colour, `#rgb` or `#rrggbb`. Anything else is ignored. |
| `data-mark` | `accent` (the logo follows the accent) · `heresay` (keep the Heresay teal) |
| `data-theme` | `auto` (follows the device) · `light` · `dark` |
| `data-font` | `system` · `inherit` (the page's font) |

**Words**

| Attribute | Values |
| --- | --- |
| `data-lang` | the page's `<html lang>` · `auto` (the browser's) · `en` · `fr` · `ta` (Tamil) · `hi` (Hindi). Other languages show English. |
| `data-placeholder` | the question in the text box, up to 120 characters |
| `data-types` | all four · a comma list of `broken`, `confusing`, `improvement`, `idea`. Their names can't change: the type sets the priority. |
| `data-thanks` | none · a line shown after sending, up to 160 characters. Don't promise a fix. |

Intro wording: `window.Heresay?.introduce({ title, body })`. Leave it out unless asked; the
default says what matters.

**The panel**

| Attribute | Values |
| --- | --- |
| `data-panel` | `corner` (next to the button) · `sheet` (full height on that side) · `center` |
| `data-width` | `regular` · `narrow` · `wide` |
| `data-backdrop` | `dim` · `clear` · `blur` |
| `data-preferences` | `show` · `hide` (hide it when the app calls `identify()` and wants nothing else asked) |
| `data-intro` | not set (the app calls `introduce()`) · `auto` (3 s after the first visit) |

**The trail**

With each report, the widget attaches what happened in the app in the last few minutes:
pages visited, what was clicked (by its label), requests that failed, errors and console
warnings. The reporter sees it in the form and can switch it off or leave parts out. Never what
anyone typed, request bodies, headers or query strings. On by default; change it only when asked.

| Attribute | Values |
| --- | --- |
| `data-trail` | on (default) · `off` · the parts to keep, e.g. `pages errors requests` (from `pages`, `clicks`, `requests`, `errors`) |
| `data-heresay-private` | on any element of the app: clicks on it are recorded as "button", without its text |

**Calls**

- `window.Heresay?.open({ type, text })`: opens the form, filled in. The person still reviews and sends it.
- `window.Heresay?.on('sent', ({ id, type }) => ...)`: after each report is sent, for example to thank them or count it in the app's analytics. It returns a function that stops listening. It never gets the report text.

## Can't be changed

The Heresay mark on the button, the report types' names, the "Your reports" tab (people must
be able to read why a report was declined), and the "Powered by Heresay" line in the panel and
the introduction. People should be able to tell the app uses an outside tool. Don't hide these
with CSS, `::part` or scripts.

## Example

```html
<script src="SDK_URL" data-key="KEY"
        data-position="left" data-accent="#7c3aed" data-label="Feedback"
        defer></script>
```

In Next.js, Nuxt and the rest, add the same attributes to the tag's existing form (for example
`<Script ... data-position="left" />`). After changing it, run the app and look at the button,
the open panel and the introduction.
