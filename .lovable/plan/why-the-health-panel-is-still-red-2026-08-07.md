# Why the health panel is still red

The last fix worked in preview but not in production — and the new error message finally tells us exactly why.

The newest failed run (14:15 UTC) no longer says the meaningless "Cannot read properties of undefined" error. It says:

- Primary market source: **HTTP 403** (an HTML block page — the provider refuses requests from our backend's region).
- Backup market source: **HTTP 403 — "Please add a descriptive User-Agent to your request."**

So both sources are blocked, for two different and unrelated reasons. The single successful run at 14:10 was the manual one I triggered from the build sandbox, which has a different network path — that's why it looked fixed.

Everything above 14:10 in the list is old history from before the fix; those rows are permanent records and will never turn green. Only the runs from now on matter.

## The fix

**1. Identify ourselves on every outbound data call.** The backup provider rejects anonymous requests outright. Adding a proper application User-Agent (and Accept) header to every market call makes that 403 disappear. This alone should make the backup path work and restore the whole heartbeat.

**2. Stop depending on one blocked venue.** Extend the source chain beyond two entries so a single region block can't stall the platform: primary venue, then its public data mirror, then a second exchange, then the aggregator backup. First one that answers wins, and the health panel shows which one served the data.

**3. Make failures readable, not scary.** The health panel currently lists raw failed runs with no context. It gets:
   - A rolling window summary (last 24h: N runs, N failed) so a resolved incident stops dominating the view.
   - A clear "resolved" marker once a green run lands after a failure streak, instead of an endless red wall of historical rows.
   - The blocked-provider detail rendered as a short readable reason rather than a raw HTML dump.

**4. Verify against production, not the sandbox.** After publishing, I'll call the live cron endpoint on the published domain and confirm a green run recorded from the real backend network path — that is the only check that proves it.

## Technical notes

- `src/lib/brain-server.ts`: shared `marketFetch()` helper adding `User-Agent: EliteFlux/1.0 (+https://elitefluxx.lovable.app)` and `Accept: application/json` to every provider call (`fetchTickers`, `fetchTickersFallback`, `fetchGlobal`, `fetchFng`). Replace the two-step try/catch with an ordered source list — `binance` → `data-api.binance.vision` mirror → `okx` public tickers → `coingecko` — each mapped into the existing `Ticker` shape; widen `tickerSource` to name the venue used.
- `src/lib/market.tsx`: same header treatment on the browser-side provider calls it still makes.
- `src/components/eliteflux/admin/HealthPanel.tsx` + `src/lib/admin.functions.ts`: 24h run-window rollup, resolved-streak state, and truncated/cleaned failure reason text.
- No schema changes; no changes to alert, coach, autopilot or payment logic.
