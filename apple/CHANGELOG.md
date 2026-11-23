# Heresay for Apple: changelog

What changed in each release, for the people using your app and for you. Updating? Do what "Action needed" says, if anything shows.

<<<<<<< HEAD
## [0.2.51] - Unreleased
=======
## [0.2.51] - 2026-11-23
>>>>>>> origin/master

### What the people using your app see

- When an app opens Heresay from its own button, the panel now opens centred (it used to sit in the bottom-right corner)
- Clicking or tapping outside the panel closes it, and what they had typed is kept for next time.

### For developers

- Web: an app's own button (data-heresay-open, or Heresay.open() from a click) opens a centred window with the page dimmed; the bar layout docks at the bottom centre. data-panel="beside" opens it next to the button instead.
- Swift: Heresay.present() from your own button opens a centred sheet; add .heresayAnchor() to that button to open it next to the button on iPad and Mac.
- Opened by code with no click, the panel is centred.
- Web: data-heresay-mark on any element (an empty span inside your own button) is filled with the Heresay mark, 1em square; data-heresay-mark="currentColor" takes the text colour, otherwise the accent. Swift: HeresayMarkIcon() sizes the mark to the text. The dashboard's Design page shows a snippet when the button is "Never".

## [0.2.50] - 2026-11-23

### What the people using your app see

- The Report panel was redesigned: no tabs, compact type pills, a shorter intro, and a sent view after reporting.
- Name and email sit under Your reports instead of the form; reporters no longer see trail controls.
- On iOS and macOS 26 the panel uses the system glass look.

### For developers

- Three layouts: composer (default), steps, bar. Web data-layout, Swift HeresayStyle(layout:).
- data-position takes bottom-right, bottom-left, top-right, top-left, bottom-center, left-tab, right-tab or none.
- Agent guides are clearer about placement and layout.

### Action needed

- None required. Check where the Report button sits if the app positioned it by hand.

## [0.2.49] - 2026-11-23

### For developers

- iOS runs that were never active are no longer counted as crashes in crash reports.

## [0.2.48] - 2026-11-10

### What the people using your app see

- After a crash, hang, out-of-memory or force quit, an app that turned on crash reports sends it by itself at the next launch.

### For developers

- crashReports: .send on iOS and macOS; it waits in the inbox like any report. Off until the app turns it on.

## [0.2.47] - 2026-11-07

### For developers

- Setup reserves a clean address, heresay-<name>.web.app.

## [0.2.46] - 2026-11-07

### For developers

- The dashboard is served at the root of a Heresay.

## [0.2.45] - 2026-11-06

### For developers

- Backup and restore for a Heresay; setup and connect polish, named sites, runs with no terminal.

## [0.2.44] - 2026-11-06

### For developers

- Lite hosting on the free Spark plan, with fewer database reads.

## [0.2.43] - 2026-10-27

### For developers

- Telegram alerts are formatted: bold headline, type, id and an Open link.

## [0.2.42] - 2026-10-27

### For developers

- Notifications are small modules on the dashboard; the Telegram webhook registers on any save.

## [0.2.41] - 2026-10-27

### For developers

- Select and accept several open reports at once. A long file sent from a chat app arrives as one request.

## [0.2.40] - 2026-10-26

### For developers

- Act on Heresay notifications from Telegram.

## [0.2.39] - 2026-10-26

### For developers

- A connected Telegram bot gets the Heresay logo as its picture.

## [0.2.38] - 2026-10-25

### For developers

- The dashboard updates itself (delta polling), without reloading.

## [0.2.37] - 2026-10-23

### For developers

- Every report's source is labelled the same way in the list and on the report. The dashboard's dark mode uses the on-dark logo.

## [0.2.36] - 2026-10-21

### For developers

- Agents see every app on their repo. A dead Heresay address is an error, not "nothing to do".

## [0.2.35] - 2026-10-19

### For developers

- Dashboard dark mode follows the device, with an Auto/Light/Dark toggle. A Heresay can deploy to a named hosting site (HERESAY_SITE).
