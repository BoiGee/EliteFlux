# Confirm and stabilize `evaluate-alerts` recovery

## Confirmed diagnosis

- This is **not a normal healthy state**: 64 failures in 65 runs means alerts were not being evaluated during most of the last 24 hours.
- The latest failed alert run occurred at 14:45 UTC and exhausted the older four-source path: two sources returned 403 and two returned 429.
- The live market feed recovered at 14:46 UTC through the newly deployed independent backup source, returned all 20 tracked coins, and saved a fresh database snapshot.
- The “64 failed” count is a rolling 24-hour history. It will remain visible after recovery until those old failures age out; the important immediate signal is whether the newest alert run succeeds.

## Plan

1. Trigger one production `evaluate-alerts` run now that the recovered feed and durable snapshot are available.
2. Verify that the run records `ok`, evaluates the six enabled alerts, and does not create duplicate alert deliveries or automation actions.
3. Confirm the following scheduled run also succeeds, proving this is not only an in-memory cache recovery.
4. If either run still fails, trace the exact production path and fix the alert job to consume the same working stored/shared feed as `/api/public/market-feed` rather than independently exhausting providers.
5. Adjust the admin health presentation so the latest successful run clearly shows **Recovered**, while retaining the 24-hour incident count as history rather than making the service appear currently down.

## Expected result

The latest status becomes green/recovered, alerts are evaluated again, and the 24-hour failure total gradually drops as old failed runs leave the rolling window.

## Technical scope

- Production verification: `/api/public/evaluate-alerts`, `system_runs`, `market_snapshots`, and alert delivery/action records.
- Conditional code changes only if production verification fails.
- Admin presentation changes limited to current-vs-historical health wording and status color.