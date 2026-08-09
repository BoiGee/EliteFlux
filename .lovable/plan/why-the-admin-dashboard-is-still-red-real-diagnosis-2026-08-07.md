# Why the admin dashboard is still red — real diagnosis

I checked the live published backend, not the sandbox. The previous fix **is** deployed (the new four-source chain shows in the live error text), and it still fails. Here is the exact response from the live site right now:

- Main venue: **HTTP 403 — request blocked** (region/IP block)
- Its public mirror: **HTTP 403 Forbidden**
- Second exchange: **HTTP 429 — Too Many Requests**
- Aggregator backup: **HTTP 429 — rate limit exceeded**

So the User-Agent fix did work (the "add a descriptive User-Agent" 403 is gone), but it exposed the real problem: **our backend's outbound network address is blocked by the exchanges and rate-limited by the free public data endpoints.** Adding more free anonymous sources cannot fix that — every one of them either blocks that address range or throttles it. That is the root cause, and it's why the panel keeps going red.

Two further problems make one bad minute look like a total outage:

1. **No last-good data anywhere durable.** The cache lives in the memory of a single short-lived server instance, so it evaporates constantly, and every fresh instance goes back to the providers — which is exactly what triggers the 429 throttling. We already store market snapshots in the database, but only after a *successful* run, and they are never read back as a fallback.
2. **One provider hiccup = a hard failed run.** The alerts job aborts entirely when data is missing, so a 30-second provider blip is recorded as a red failure instead of a skipped cycle.

Also confirmed: the last background run was 14:15 and there has been none since — the job runs every 15 minutes, so the panel is showing the pre-fix cycle plus the failure above.

## The fix

**1. Use a data source that authenticates us instead of guessing our IP is trusted.** Move the primary feed to a keyed provider so we are identified by an API key rather than by network address — keyed requests aren't region-blocked and get a real rate-limit allowance. I'll need one free API key from you for this (see the question below). The existing free chain stays behind it as backup.

**2. Add exchange endpoints that don't block us.** Extend the chain with venues that serve backend traffic freely (Kraken, Coinbase, Bitstamp public tickers), each mapped to our standard format. First one that answers wins.

**3. Make the last good reading durable.** Persist every successful market read to the database and serve it as the final fallback when every provider refuses. Result: the dashboard shows slightly stale prices with a clear "data is N minutes old" note instead of an outage.

**4. Stop hammering the providers.** One scheduled refresh writes the shared feed; user page loads read that stored feed rather than each triggering their own upstream call. This alone removes the 429s.

**5. Never record a red run for a transient blip.** When data is unavailable, the alerts cycle finishes as "skipped — no fresh data" (amber, not red) and only escalates to failed after repeated consecutive misses. Health panel gains a plain-English data-source line: which source served the data, how old it is, and what each blocked source said.

**6. Verify on production.** After publishing I'll call the live endpoints and confirm a green run recorded from the real backend, not the sandbox.

## Technical notes

- `src/lib/brain-server.ts`: keyed provider first in `TICKER_SOURCES` (API key read inside the handler), plus Kraken/Coinbase adapters; `loadTickers` gains a final `stored` source reading the newest `market_snapshots.coins` row.
- `src/lib/market-history.server.ts`: `persistSnapshot` called on every successful upstream read (not just alert runs); add `loadLastSnapshotTickers()` with an age cap.
- `src/routes/api/public/market-feed.ts` + `ttl-cache.server.ts`: longer TTL, DB-backed last-good, stale-serving with an `age`/`source` field in the response.
- `src/routes/api/public/evaluate-alerts.ts`: no-data path finishes the run as `skipped`; `finishRun` accepts that status and only notifies operators after N consecutive misses.
- `src/lib/admin.functions.ts` + `HealthPanel.tsx`: surface `source`, `ageMinutes`, and per-source block reasons; treat `skipped` as amber.
- No schema changes; no changes to coach, autopilot, or payment logic.
