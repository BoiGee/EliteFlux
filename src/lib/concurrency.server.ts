// Shared server-only concurrency limiter. Firing 20+ simultaneous requests
// at a single host that's actively blocking this Worker (Binance, confirmed
// this session) tends to trip Cloudflare's own "stalled response canceled to
// prevent deadlock" protection — observed live, contributing to
// evaluate-alerts cycles running far longer than the per-request 8s timeout
// fixes alone would predict. Capping how many requests to the same host are
// in flight at once keeps each cycle's connection count bounded and
// predictable instead of bursting all at once.

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at a time.
 * Order of `results` matches `items`; a rejected `fn` call still lets the
 * pool continue with the rest unless the caller wants otherwise (individual
 * callers here already wrap `fn` in their own try/catch for partial-failure
 * tolerance, matching the existing best-effort convention in this codebase).
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
