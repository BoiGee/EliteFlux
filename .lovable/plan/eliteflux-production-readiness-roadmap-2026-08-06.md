# EliteFlux — Production Readiness Roadmap

Ordered by impact. Each item is a concrete fix, not a research task. Items 1–4 are what actually break first under real traffic; 5–8 are trust and operations; 9–10 are launch hygiene.

## 1. Stop every browser from calling the market providers directly
Today the live market provider in the browser polls the upstream price API every 20 seconds and opens a websocket per visitor, and the server intelligence engine re-fetches upstream on every request with no cache. At a few thousand concurrent users this hits third-party rate limits and the whole dashboard goes blank at once — this is the single hardest ceiling in the app.

Fix: one server-side market cache. A single endpoint serves the snapshot with a short TTL (5–10s) shared across all users; the browser reads that endpoint instead of the provider. Keep one server-side upstream connection, not one per visitor. Result: upstream calls become constant regardless of user count.

## 2. Cache the intelligence snapshot
The brain snapshot recomputes all layers from fresh upstream data on every call, and it is called by the dashboard, the coach, the alert cron and the MCP tools.

Fix: memoize the computed snapshot behind the same TTL as item 1, plus a stale-while-revalidate fallback so a provider hiccup serves the last good snapshot instead of a 502.

## 3. Make the alert/autopilot cron horizontally safe
The cron endpoint loads every enabled alert and every autopilot user and processes them serially inside one request. That works at 12 MB of data and fails silently (timeout, partial run) as users grow, and a slow run can overlap with the next one.

Fix: batch and page the work, add a run lock so two overlapping invocations can't double-fire alerts, and record a run summary row (started, finished, evaluated, fired, errors) so a partial run is visible instead of invisible.

## 4. Add indexes and query limits for the hot paths
Alerts by `enabled`, alert history by `user_id + fired_at`, deliveries by `user_id`, market snapshots by `captured_at`, autopilot actions by `user_id + status`.

Fix: targeted indexes for each, confirmed with query plans before and after, plus hard `limit()` on every list query that currently has none.

## 5. Server-side admin gate
`/admin` only redirects from the client after render, so the page flashes before it bounces. Data is protected by row-level security, but it reads as unlocked.

Fix: check the admin role on the server before the page renders and return a proper redirect for non-admins.

## 6. Throttle payment verification and external-API calls
Payment TXID submission calls the chain explorer with no per-user throttle, so one user can hammer it. Note: the platform has no built-in rate-limiting primitive, so this is an ad-hoc per-user counter in the database — a deliberate tradeoff, applied only to the endpoints that call paid/limited third parties (payment verification, coach, MCP).

## 7. Failure visibility
There is currently no way to know the cron stopped firing, a provider started 429-ing, or webhook deliveries all began failing.

Fix: a small internal health surface — last successful cron run, upstream provider error rate, delivery failure count in the last hour — plus an admin-page panel showing it. Cheap, and it's the difference between hearing about an outage from users and seeing it yourself.

## 8. Autopilot safety rails before real money scales
Autopilot executes inside user guardrails today. Before wide launch it needs: an immutable audit log of every proposed and executed action, a global kill switch, and a per-user daily execution cap enforced server-side (not only in the UI).

## 9. Cost and abuse control on the AI coach
Coach calls are per-user and unbounded. Add per-tier daily message caps enforced server-side, and truncate thread context sent upstream so long threads don't grow cost linearly.

## 10. Load-test and confirm
Run a scripted load test against the cached endpoints at realistic concurrency, confirm upstream call volume stays flat as simulated users increase, and record the numbers. Without this, items 1–4 are unproven.

## Technical notes
- Items 1 and 2 are one change in practice: a cached snapshot module on the server, consumed by the dashboard route, the coach, the cron and MCP. The browser websocket becomes an optional enhancement, not the source of truth.
- The run lock in item 3 is a single-row advisory lock or a `cron_runs` table with a unique in-progress constraint — no new infrastructure.
- All new tables need explicit grants and row-level security following the existing pattern.
- No new third-party services are required for any item here.

## Suggested sequencing
1. Items 1–2 together (the scaling ceiling).
2. Items 3–4 (correctness under growth).
3. Items 5–7 (trust and operability).
4. Items 8–10 before opening autopilot and paid tiers to the public.
