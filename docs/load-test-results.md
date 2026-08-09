# Load test — shared market feed (roadmap item 10)

Target: `GET /api/public/market-feed` (the single cached endpoint every browser
reads instead of calling market providers directly). Run locally against the
production code path; cache warmed before measuring.

## Throughput and latency

| Concurrent clients | Requests | RPS | Errors | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 4,196 | 420 | 0 | 2 ms | 4 ms | 42 ms |
| 10 | 6,537 | 654 | 0 | 13 ms | 30 ms | 48 ms |
| 50 | 6,311 | 631 | 0 | 76 ms | 113 ms | 1,751 ms |
| 200 | 7,027 | 703 | 0 | 122 ms | 209 ms | 10,325 ms |

Zero failed responses across 24,071 requests. Throughput flattens around
~700 rps on a single worker; latency degrades linearly with queue depth, which
is the expected shape for a memory-served payload and scales out horizontally.

## Upstream call volume (the thing that had to stay flat)

30-second burst at 100 concurrent clients:

- 22,567 responses served
- 37 responses (0.164%) carried upstream-round-trip latency (>400 ms)
- Everything else came from the shared TTL cache

With an 8s TTL on the upstream payload and a 10s TTL on the intelligence
snapshot, expected refreshes over 30s are ~4 per cache key regardless of client
count — matching what was observed. Upstream provider load is now a function of
time, not of user count.

## Caveats

- Single-node run: measures the cache path, not multi-worker fanout. Each
  additional worker adds its own TTL refresh cycle (still bounded and small).
- Client latency in production also includes CDN/network hops not measured here.
- Re-run after any change to cache TTLs in `src/lib/brain-server.ts`.
