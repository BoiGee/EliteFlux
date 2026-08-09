// Tiny server-side TTL cache with stale-while-revalidate and last-good
// fallback. Keeps upstream provider calls constant regardless of how many
// users are on the app: everyone shares one in-flight fetch per key.

interface Entry<T> {
  value: T;
  at: number;
  /** True when `value` has never been populated by a successful load. */
  empty?: boolean;
  inflight?: Promise<T>;
}


const store = new Map<string, Entry<unknown>>();

export interface CacheOptions {
  /** Serve from memory without touching upstream for this long. */
  ttlMs: number;
  /** Keep serving the stale value (while refreshing) up to this age. */
  staleMs?: number;
}

export async function cached<T>(key: string, opts: CacheOptions, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;
  const staleMs = opts.staleMs ?? opts.ttlMs * 10;

  const hasValue = !!entry && !entry.empty;

  if (hasValue && now - entry!.at < opts.ttlMs) return entry!.value;

  // Coalesce concurrent misses into one upstream request.
  if (entry?.inflight) {
    if (hasValue && now - entry.at < staleMs) return entry.value;
    return entry.inflight;
  }

  const inflight = load()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err) => {
      const prev = store.get(key) as Entry<T> | undefined;
      if (prev && !prev.empty) {
        // Provider hiccup: keep serving the last good value instead of 502ing.
        store.set(key, { value: prev.value, at: prev.at });
        return prev.value;
      }
      // Nothing good was ever cached — surface the real failure.
      store.delete(key);
      throw err;
    });

  store.set(key, {
    value: entry?.value as T,
    at: hasValue ? entry!.at : 0,
    empty: !hasValue,
    inflight,
  });

  if (hasValue && now - entry!.at < staleMs) {
    // Stale-while-revalidate: return immediately, refresh in the background.
    void inflight.catch(() => {});
    return entry!.value;
  }


  return inflight;
}

/** Age in ms of a cached key, or null when absent. */
export function cacheAge(key: string): number | null {
  const e = store.get(key);
  if (!e || !e.at) return null;
  return Date.now() - e.at;
}
