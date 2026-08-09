// ============================================================
// Community Trust Layer
// ------------------------------------------------------------
// The one piece of collected data that has never been read back:
// thumbs up/down on opportunities (`user_feedback`). This isn't a
// price prediction — it's "do the people who acted on this pick
// trust it," which can catch things the engine's own signals can't
// (a token users know is compromised, delisted, or a scam long
// before on-chain/price data reflects it). Global, not per-user —
// pooled across everyone, same as every other engine layer, and
// gated on a minimum number of distinct raters so one person can't
// move a symbol's score.
// ============================================================

type Admin = { from: (t: string) => any };

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export interface SymbolTrust {
  symbol: string;
  upvotes: number;
  downvotes: number;
  raters: number;
  score: number; // 0..100, 50 = neutral / not enough raters yet
}

export interface CommunityTrustIntel {
  perAsset: Record<string, SymbolTrust | undefined>;
  generatedAt: number;
}

const LOOKBACK_DAYS = 14;
const MIN_RATERS = 3;

export async function getCommunityTrustIntel(admin: Admin): Promise<CommunityTrustIntel> {
  const now = Date.now();
  const perAsset: CommunityTrustIntel["perAsset"] = {};
  try {
    const since = new Date(now - LOOKBACK_DAYS * 86400_000).toISOString();
    const { data } = await admin
      .from("user_feedback")
      .select("subject_id,rating,user_id")
      .eq("subject_type", "opportunity")
      .gte("created_at", since)
      .limit(20000);

    const rows = (data ?? []) as { subject_id: string; rating: "up" | "down"; user_id: string }[];
    const bySymbol = new Map<string, { up: number; down: number; raters: Set<string> }>();
    for (const r of rows) {
      const bucket = bySymbol.get(r.subject_id) ?? { up: 0, down: 0, raters: new Set<string>() };
      if (r.rating === "up") bucket.up++;
      else bucket.down++;
      bucket.raters.add(r.user_id);
      bySymbol.set(r.subject_id, bucket);
    }

    for (const [symbol, b] of bySymbol) {
      const raters = b.raters.size;
      const total = b.up + b.down;
      const score = raters >= MIN_RATERS && total > 0 ? Math.round(clamp(50 + ((b.up - b.down) / total) * 40)) : 50;
      perAsset[symbol] = { symbol, upvotes: b.up, downvotes: b.down, raters, score };
    }
  } catch {
    /* no feedback yet, or table unreachable — everything stays neutral */
  }

  return { perAsset, generatedAt: now };
}
