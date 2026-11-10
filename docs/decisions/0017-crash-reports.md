# 0017: Crash reports the app sends by itself

Date: 2026-11-10

## Decided

- **An app can have its crashes reported without anyone pressing Report:**
  `Heresay.configure(…, crashReports: .send)` on iOS and macOS. A crash on every launch, or one
  nobody bothers to report, otherwise never reaches the team. The trail decision (0007) said "a
  crash on every launch can't be reported from the app at all"; this is the answer.
- **Off by default; the host turns it on.** This reverses "nothing leaves the device unless
  someone sends a report" (0007) for the apps that choose it, so it is the app's decision, made
  in its own code, and its privacy details have to say so. No per-host defaults.
- **What triggers it: a run that ended badly**, as the black box already knows it (0007, "Outliving
  a crash"): a crash, a hang the system killed, running out of memory, or a force quit. At the next
  launch, inside `configure`, before the app does anything else.
- **It outlives a crash loop.** It goes as a background upload (`URLSession` background session),
  which the system finishes even if the app crashes again a moment later. It can't help a crash
  before `configure` runs (a missing library, a launch-time signing failure): the guide says to
  make `configure` the first line of the `App`'s `init`.
- **Same gate as everything else.** It is a report like any other: `source: 'crash'`, always
  Broken (the server sets the type; the client's is ignored), rate-limited per device, network and
  key, origin rules unchanged. It waits in the inbox; only a person's accept makes it a brief. The
  dashboard labels it "Sent automatically after a crash" and can filter to it. The text is the
  device's own line ("The app closed unexpectedly 2 s after launch …"), still fenced for agents.
- **Once per bad run, at most three a day per device.** Marked before it is sent, so a launch
  that crashes too doesn't send it again. A crash loop across many devices still means many
  reports: duplicates are merged by a person (0012), with the usual suggestion.

## Later

- The web SDK: an uncaught error on page load, reported by itself (`data-crash-reports="send"`).
- Grouping crash reports that share an ending and version into one card automatically.
