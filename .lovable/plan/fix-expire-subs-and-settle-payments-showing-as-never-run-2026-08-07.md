# Fix "expire-subs" (and settle-payments) showing as never run

## What I found

The alert engine is now healthy, but the other two background jobs are not reporting at all:

- The database has recorded **68 job runs — all of them `evaluate-alerts`**. There is not a single `expire-subs` or `settle-payments` record, which is why the health panel shows them red/"never run".
- The daily plan-expiry schedule **does exist and does fire** (it has run at 00:05 UTC every day, including today, and the scheduler reports success each time).
- Cause: the expiry endpoint does its work but **never opens or closes a run record**, unlike the alert job and payment job which both do. So it is invisible to the health panel by design, not broken.
- Separately, **there is no schedule at all for the payment re-check job**. Only two schedules exist (daily expiry, 15-minute alerts). The payment job does write run records, so it will stay "never run" until it is scheduled.

## What to change

1. **Make the plan-expiry job report itself.** Wrap its work in the same run bookkeeping the other jobs use: claim the run lock at the start, and close it out with how many subscriptions were checked and how many were downgraded, or a failure record if the database call errors. This also protects against overlapping runs.
2. **Schedule the payment re-check job.** Add an hourly schedule that calls the existing payment settlement endpoint, matching the pattern of the two existing schedules.
3. **Match the health panel's expectations to reality.** The panel expects the payment job every 2 hours and the expiry job roughly daily; keep those, so an hourly payment job and a daily expiry job both read as healthy.
4. **Verify after publishing:** trigger both jobs from the admin console's "Run now" buttons and confirm each writes an `ok` record with sensible counts, then confirm the next scheduled expiry run also records.

## Technical notes

- `src/routes/api/public/expire-subs.ts`: import `beginRun` / `finishRun` from `src/lib/system-runs.server.ts`; return 202 when the lock is held; `evaluated` = rows selected, `fired` = rows downgraded, `errors` = failed updates; wrap in try/finally so a throw still closes the run as `failed`.
- Payment job schedule via `pg_cron` + `pg_net` POST to `/api/public/settle-payments` with the `apikey` header (same shape as the existing two jobs), applied with the insert tool rather than a migration since it embeds project-specific URL and key.
- No changes needed to the expiry business logic itself — it is idempotent and already correct.

## Out of scope

- Any change to the alert engine or market data source chain (already recovered).
