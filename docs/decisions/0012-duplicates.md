# 0012: Duplicates

Date: 2026-10-16

## Decided

- **A person merges; Heresay suggests.** On an open report, **Merge into…** picks another open or
  accepted report of the same product (any of its platforms). The dashboard flags an open report
  that reads like an older one ("Looks like the same as …"), from shared words, as a hint only.
  Nothing merges without a person, because a wrong merge tells someone their problem was fixed
  when it wasn't.
- **One card, everyone kept.** A merged report leaves the list and shows under the one it was
  merged into ("3 people reported this"), and the count moves it up among reports of its type.
  Its own text, device and trail stay as they were.
- **Everyone hears the outcome.** Accepting, declining (with its reason) or fixing (with its
  note) the main report does the same to every report merged into it, so each reporter sees it
  in their app. Merging into an already accepted report accepts the new one at once.
- **The agent gets everyone's words.** The brief lists the merged reports' text under "N more
  people reported the same thing", inside the fence: different people describe the same bug
  differently, and the fix should cover all of it.
- **One level, no chains.** Merging into a report that is itself merged lands on the top one;
  reports already merged into the one being merged move along. Unmerge while both are still
  open; after that the reporter has already heard the outcome.
- `Store.updateReport` changes non-status fields; status still moves only through `accept` and
  `move`.

## Not done

- Automatic merging, even at high similarity. Suggestions only.
- Merging across products.
