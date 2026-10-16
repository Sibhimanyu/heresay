# 0008: Offering help when someone seems stuck

Date: 2026-10-16

## Decided

- **A small note by the button asks "Something not working?"** when someone seems stuck, with
  **Tell the team** (opens the form as Broken, the trail attached) and **Not now**. Most people
  who hit a problem never look for a Report button; asking at the moment it happens is when they
  still remember what they did.
- **Off by default; the host turns it on.** Unlike the trail, which only travels inside a report
  someone chose to send, this puts something on the host's page that they didn't ask for. Web:
  `data-nudge="on"` or a list of signals. Swift: `configure(…, nudge: .all)`. No per-host defaults.
- **Watched on the device, never sent.** The signals live in memory and lead only to the note.
  Nothing reaches the server unless the person writes and sends a report, so the trail's rule
  ("only when a person reports") holds.
- **Rarely.** At most once per tab (web, `sessionStorage`) or launch (Swift), and not for 7 days
  after "Not now". Not over the open panel or the introduction, not on paths or screens where the
  button is hidden. It takes no focus, goes by itself after 15 s unless the pointer or focus is on
  it, and on Apple platforms VoiceOver announces it (and it stays while VoiceOver is running).
- **The host can ask too:** `Heresay.nudge()` on both, for an error screen or a retry that failed.
  It works without the setting, with the same limits.

### The signals

Chosen so a false alarm is rare; missing some trouble is the better mistake.

| | Web | macOS | iOS |
| --- | --- | --- | --- |
| Clicks that did nothing | The same button or link pressed 3 times in 10 s, and neither the page (MutationObserver) nor the address changed within 1.5 s of each. `pointerdown`, so a disabled button counts. Links to new tabs, downloads, `mailto:`/`tel:` don't. | A disabled `NSControl` clicked 3 times in 10 s, or one spot clicked 5 times in 2 s. Text, sliders, steppers and scroll bars don't count. | none: no taps without swizzling |
| Errors | An uncaught error or failed promise within 5 s of a click. Not from extensions, not `ResizeObserver loop`, not cross-origin `Script error.`, not from `sdk.js`. | none: the log is read only when someone reports | none |
| Requests | 2 failing with 5xx or no answer within 30 s, while online. A 4xx is usually the app answering. | none: no URLProtocol | none |
| Last crash | none | MetricKit, once per crash | MetricKit, once per crash |

## Unsure, not blocked (2026-10-16)

- **A second wording for hesitation:** "Stuck on something?" / "If something here isn't clear,
  tell the team", opening as Confusing. Someone who stalls hasn't hit a failure, and Broken would
  be the wrong type for the team's priority.
- **Three signals**, each opt-in, all in `on` / `.all`:
  - `stalled`: typed in a field, then 45 s with no more typing and nothing sent, still on the
    page. Web: and still present (moved or scrolled in the last 15 s), so someone who walked away
    isn't asked. Apple: the field still being edited (the keyboard still up on iOS) and the app
    in front. Search fields never count: typing and then reading results is normal.
  - `circles`: 6 page or screen changes in a minute among at most 3, one of them seen 3 times.
    List-and-detail browsing visits new pages, so it doesn't trigger.
  - `refused` (web): the same field refused 3 times in 2 minutes, by the browser's own check or
    the app setting `aria-invalid="true"`.
- **Anything sent starts these over:** a form submit, or a request other than GET or HEAD that
  worked.
- Only that something was typed is noticed, never what.

## Not done

- **Back and forth between two pages.** List and detail screens do that all day.
- **A counter button pressed quickly** (quantity +) changes the page, so it is not "did nothing".
  On macOS, where the page can't be watched cheaply, rapid clicks need 5 in one spot; games and
  drawing apps should leave `.clicks` out.
- **Saying in the report that it came from the note.** The trail already shows the repeated
  clicks or the error; a new field would need the server and the dashboard for little.

## Costs accepted

- A Material-style ripple, a clock or a carousel changes the page on its own, so clicks there
  never count as "did nothing". The safe direction.
- On the web, request failures are seen only by the trail's `fetch`/XHR wrappers, which
  `data-nudge="requests"` installs even when `data-trail` leaves requests out.
