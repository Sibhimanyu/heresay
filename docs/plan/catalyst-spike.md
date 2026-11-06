# Catalyst spike: a Store on Data Store

Status: written and tested against a SQLite stand-in, then spot-checked by hand on a real Catalyst
project (2026-11-06, `squeak-trial`, Development; tables removed afterwards). The store itself has
**not** been run end to end on Catalyst.
Code: `functions/src/providers/catalyst/` (`catalyst-store.ts`, `zcql.ts`).
Tests: `functions/test/store-catalyst.test.ts` (the shared Store contract plus races, escaping,
big documents).

## Tables

Create both in Data Store (Console, or the Catalyst MCP). Names and columns are case-sensitive.

`hs_entity`

| Column | Type | Notes |
| --- | --- | --- |
| ekey | varchar(255) | **unique**, not null |
| etype | varchar(32) | |
| ix1, ix2, ix3, ix4 | varchar(255) | lookups; default empty |
| rev | int | compare-and-swap counter |
| nonce | varchar(64) | |
| claimed | varchar(64) | one-shot claim, default empty |
| gen | varchar(64) | |
| nparts | int | |
| body | text | base64, up to 8,000 characters |

`hs_chunk`: `ekey` varchar(255), `gen` varchar(64), `part` int, `ix1` varchar(255), `body` text.

Use the admin scope (`catalyst.initialize(req, { scope: 'admin' })`); App Users are read-only.

## Checked on a real project

| Assumption | Result |
| --- | --- |
| Conditional `UPDATE ... WHERE ROWID=n AND rev=r` changes nothing for a stale writer | Confirmed, one writer at a time. True concurrency was not tested. |
| Unique `ekey` rejects a second insert | Confirmed: "Duplicate value for ekey" (matches the store's check) |
| `ix4 > 'iso string'` and `ORDER BY ix3 DESC` | Confirmed |
| `<>`, `DELETE ... AND etype IN (...)` | Confirmed |
| `SELECT *` returns `ROWID` and strings | Confirmed: numbers come back as strings, `ROWID` is a 17-digit string, empty strings stay `''` (not null) |
| `INSERT` returns the row | Yes |
| **`LIMIT start, count`** | **Differs from SQL.** `start` counts rows from 1; `0` and `1` both mean the first row. The store pages with `out.length + 1`. (The Catalyst skill's `LIMIT 0, 300` then `LIMIT 300, 300` example would repeat row 300.) |
| Text column takes 8,000 characters | Not exercised; the column reports a 10,000 limit |

## Still to prove


Everything the SQLite stand-in cannot. Each is an assumption in the code today.

1. **A conditional UPDATE is atomic.** `UPDATE ... WHERE ROWID=n AND rev=r` changes nothing for a
   writer who read an older `rev`. The whole store rests on this.
2. **The unique `ekey` rejects a second insert**, with an error that matches /exists|unique|duplicate/i.
3. **`ix4 > 'iso string'` compares varchar values correctly**, and `ORDER BY ix3 DESC` works.
4. **`LIMIT offset, count` paging, `DELETE ... WHERE ix1=... AND etype IN (...)`, and `<>` work.**
5. **`SELECT *` returns `ROWID` and every column, as strings.** The store converts numbers itself.
6. **A text column takes 8,000 base64 characters** and returns them unchanged.
7. **Latency and operation counts.** A write is about two SELECTs and an UPDATE; a read of a short
   document is one SELECT. The free tier is 10,000 SELECTs and 1,000 UPDATEs a month.

## Known weak points

- **accept** is not atomic with its task. The report is claimed first, then the task is written. A
  crash between them leaves an accepted report with no task: nothing reaches an agent, and the
  report needs accepting again by hand.
- **A lost-update window**: if a third writer lands between a winner's swap and the winner's
  confirming read, the winner believes it lost and retries. Narrow, and the retry re-reads.
- **No TTL.** Expired auth records and rate counters are left in place. They carry `ix2`
  (expiry) so a cleanup job can delete them.
- **Rate counters should not live here.** One counter hit costs a SELECT and an UPDATE out of a
  small monthly quota. The Catalyst adapter should count in memory, as Lite does.

## Not done (needs more than a store)

- The API adapter: AppSail running the Lite server, or Catalyst Functions behind API Gateway.
- Dashboard sign-in: it uses the Firebase Auth web SDK, and `verifyIdToken` checks Firebase tokens.
- `create-heresay` for Catalyst: its first project and per-service enabling are console steps.
- Data Streams for a live inbox: separate feature, not a store concern.
