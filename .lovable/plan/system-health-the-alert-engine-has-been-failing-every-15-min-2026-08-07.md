# System health: the alert engine has been failing every 15 minutes

## What the console is actually showing

Confirmed from the background-run records: **every single `evaluate-alerts` run for at least the last day has failed**, at 15-minute intervals, each one with the same message — `Cannot read properties of undefined (reading 'whale')`. Zero alerts evaluated, zero fired.

Because that job is the heartbeat of the platform, everything hanging off it has been dead too:

- No alert has been checked or delivered.
- The AI Coach has graded no calls and sent no proactive nudges.
- The autopilot cycle has not run for any user.
- Market history has stopped being recorded — the `market_snapshots` table holds exactly **one** row, captured 2026-08-06 19:55 UTC. That is the "Data freshness: 18h ago" figure on the health panel.

## Root cause (confirmed in code)

Two defects stacked on top of each other.

**1. The shared cache turns an upstream failure into `undefined`.** Before fetching, the cache writes a placeholder entry with no value. If the fetch then fails, the error handler sees that placeholder, decides "there is a last good value, keep serving it" and returns `undefined` instead of raising the error. The alert job then reads `.whale` off `undefined` and dies. This is why the message is a meaningless property-access error rather than the real fault — the real fault is being swallowed on every run.

**2. The market provider is unreachable from the backend.** The cache only fails this way when the upstream fetch itself throws on a cold start, which is every cron invocation. The provider responds fine from outside, so the block is on the backend's own network path — the specific status code is currently hidden by defect 1.

## The fix

**Stop swallowing failures.** The cache must only fall back to a value it actually holds. With no real cached value, the error propagates as itself, so the run record shows the true reason (e.g. an HTTP status from the provider) instead of a property-access error.

**Report the real status.** The ticker fetch should include the provider's status code and response body snippet in its error message, so one failed run tells us exactly what the provider said.

**Add a working fallback path.** If the primary ticker source is unavailable from the backend, fall back to the secondary provider (already used for global market figures) to build the same ticker set. The job keeps running, alerts keep firing, and history keeps recording even when one source is blocked. The health panel gets a small "data source" line so a degraded-but-working state is visible rather than silent.

**Make a failing heartbeat impossible to miss.** Right now the job "runs" on schedule so it never looks stalled — it just fails. The Needs-attention strip should call out a job that has failed several consecutive times, not only one that has stopped running.

## After the fix

Once the first successful run lands, history rebuilds itself over the following hour and the freshness figure returns to minutes. I will trigger a run from the console and confirm a green record before calling it done.

## Technical notes

- `src/lib/ttl-cache.server.ts`: drop the pre-fetch placeholder write (or mark it as a placeholder) so the `catch` branch cannot resolve to `undefined`; rethrow when no genuine prior value exists.
- `src/lib/brain-server.ts`: `fetchTickers` throws with status + body excerpt; add a CoinGecko-backed ticker builder used when the Binance call fails, mapping into the existing `Ticker` shape, and surface which source was used on `BrainServerResult`.
- `src/lib/admin.functions.ts` / `HealthPanel`: add consecutive-failure detection per job and expose the active market data source.
- No schema changes. No changes to alert, coach, autopilot or payment logic.
