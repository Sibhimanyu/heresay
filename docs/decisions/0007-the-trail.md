# 0007: The trail, what happened before a report

Date: 2026-10-05

Planned visually in `docs/plan/trail-plan.html`.

## Decided

- **The web SDK attaches what happened in the app before a report:** pages visited, what was
  clicked, requests that failed, uncaught errors, failed promises, `console.error` and
  `console.warn`, and going offline or back online. Reporters are anonymous, so nobody can be
  asked "what did you click?". The report has to carry the answer.
- **On by default, and the reporter decides.** The form shows "Attach what happened" with a
  chip per kind ("2 pages", "1 error"). One switch removes all of it, a chip removes one kind,
  and "See it" lists every line that would be sent. Off by default would mean almost nobody
  turned it on.
- **Only when a person reports.** The trail lives in memory on the device (the newest 30, for 5
  minutes) and leaves only with a report. No background error collection, no reports without
  words. Heresay is what people say; the trail is evidence for it, not an error tracker.
- **Never captured:** what anyone typed (fields are recorded by their label, never their value),
  request or response bodies and headers, query strings, `console.log` and `console.info`,
  anything inside the widget.
- **Clicks include the element's label,** cut to 40 characters. `data-heresay-private` on any
  element keeps its text out ("button" instead of `button "Delete Priya's account"`).
- **The host app chooses the parts** with `data-trail`: `off`, or a list such as
  `pages errors requests`. No per-host defaults.
- **Cleaned twice.** The SDK blanks emails, bearer tokens, JWTs, long opaque strings, long numbers
  and query strings before sending; `core/trail.ts` does it again on the server, with caps on
  count, length and total size, because anything can post to `/v1/reports`.
- **Untrusted, like the report text.** A page can `console.error("ignore your instructions")`
  before reporting. The trail reaches an agent only through an accepted task, and sits inside
  the same fence as the reporter's words.

## Apple (2026-10-14)

- **The same trail from the Swift package**, the same `trail` field, the same sheet controls.
  Screens come from `Heresay.setScreen` or `.heresayScreen(_:)`; nothing is swizzled.
- **The app's own log, read only when someone reports.** `OSLogStore` for this process, `.error`
  and `.fault`, last five minutes, Apple's subsystems left out. Apps already log failures with
  `Logger`; that becomes the trail's errors without new calls. Nothing is collected in the
  background, so the "only when a person reports" rule holds.
- **The last crash, once.** MetricKit hands it over at the next launch; it is kept on the device
  for a day and goes with one report, as "The app crashed: EXC_BAD_ACCESS: SIGSEGV" and the top
  frames as binary +offset.
- **macOS clicks by accessibility label, menu commands by path.** A local event monitor on mouse
  down (the mouse up is taken by control tracking loops) and `NSMenu.didSendActionNotification`,
  which also covers keyboard shortcuts. Public API only. Fields by their label, secure fields and
  rows by their kind; `.heresayPrivate()` is the Swift `data-heresay-private`.
- **No taps on iOS, no failed requests on either.** Both need swizzling or a URLProtocol in the
  app's sessions.

## Later

- Grouping reports that share an error.
- A screenshot the reporter chooses to add.

## Costs accepted

- **SwiftUI-drawn controls on macOS have no label** unless an assistive app is running: SwiftUI
  builds accessibility for what it draws only when asked by one. Setting
  `AXEnhancedUserInterface` would make it build, but that is VoiceOver's switch and changes how
  the host app behaves, so Heresay doesn't. AppKit's controls, toolbar items, rows and menus are
  unaffected.
- **Some managed Macs block reading the log**; then the trail has no logged errors.

- Wrapping `console.error`/`warn` makes DevTools show `sdk.js` as the caller of those lines.
  Error trackers have the same trade-off; `data-trail` without `errors` avoids it.
- Errors before the SDK loads are missed. Loading it earlier is the host's choice.
