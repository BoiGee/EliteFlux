// ============================================================
// Portfolio-Aware Recommendation Context
// ------------------------------------------------------------
// The shared recommendation list is deliberately global — the same
// ranking for everyone. This layer is the personal overlay on top:
// given what a specific user already holds, flag when "buy more"
// would concentrate them further, and surface a plain concentration
// warning across their real book. Pure function, no I/O — the
// caller supplies opportunities + holdings, both already fetched.
// ============================================================
import type { EliteOpportunity } from "./recommendation-engine";

export interface PortfolioHolding {
  symbol: string;
  usd_value: number | null;
  weight: number | null;
}

export interface PortfolioAnnotatedOpportunity extends EliteOpportunity {
  portfolioNote: string | null;
  alreadyHeld: boolean;
  currentWeightPct: number | null;
}

export interface PortfolioContextResult {
  opportunities: PortfolioAnnotatedOpportunity[];
  concentrationWarning: string | null;
  totalUsd: number;
}

const OVERWEIGHT_THRESHOLD_PCT = 25; // a single position at/above this is worth flagging on its own opportunity row
const CONCENTRATION_TOP1_PCT = 40; // portfolio-wide warning thresholds
const CONCENTRATION_TOP2_PCT = 60;

/**
 * Recompute weight% from usd_value directly — trust the raw values over any
 * stored `weight`, which can go stale between syncs. Postgres numeric columns
 * can come back as strings over PostgREST, so every value is coerced defensively.
 */
function computeWeights(holdings: PortfolioHolding[]): { bySymbol: Map<string, number>; totalUsd: number } {
  const totalUsd = holdings.reduce((a, h) => a + (Number(h.usd_value) || 0), 0);
  const bySymbol = new Map<string, number>();
  if (totalUsd > 0) {
    for (const h of holdings) {
      const pct = ((Number(h.usd_value) || 0) / totalUsd) * 100;
      bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + pct);
    }
  }
  return { bySymbol, totalUsd };
}

/** Reused by both the client-side recommendation overlay and the coach's get_my_account tool. */
export function computeConcentrationWarning(holdings: PortfolioHolding[]): { concentrationWarning: string | null; totalUsd: number } {
  const { bySymbol, totalUsd } = computeWeights(holdings);
  let concentrationWarning: string | null = null;
  if (totalUsd > 0) {
    const sorted = [...bySymbol.entries()].sort((a, b) => b[1] - a[1]);
    const top1 = sorted[0];
    const top2Sum = sorted.slice(0, 2).reduce((a, [, pct]) => a + pct, 0);
    if (top1 && top1[1] >= CONCENTRATION_TOP1_PCT) {
      concentrationWarning = `${top1[0]} alone is ${top1[1].toFixed(1)}% of your tracked portfolio — a single-asset concentration risk.`;
    } else if (top2Sum >= CONCENTRATION_TOP2_PCT && sorted.length >= 2) {
      concentrationWarning = `${sorted[0]![0]} + ${sorted[1]![0]} together are ${top2Sum.toFixed(1)}% of your tracked portfolio.`;
    }
  }
  return { concentrationWarning, totalUsd };
}

export function annotateWithPortfolio(
  opportunities: EliteOpportunity[],
  holdings: PortfolioHolding[],
): PortfolioContextResult {
  const { bySymbol } = computeWeights(holdings);

  const annotated = opportunities.map((o) => {
    const currentWeightPct = bySymbol.get(o.symbol) ?? null;
    const alreadyHeld = currentWeightPct !== null;
    let portfolioNote: string | null = null;
    if (currentWeightPct !== null) {
      portfolioNote =
        currentWeightPct >= OVERWEIGHT_THRESHOLD_PCT
          ? `Already your largest position (${currentWeightPct.toFixed(1)}% of portfolio) — sizing up adds concentration risk.`
          : `Already held (${currentWeightPct.toFixed(1)}% of portfolio).`;
    }
    return { ...o, portfolioNote, alreadyHeld, currentWeightPct };
  });

  const { concentrationWarning, totalUsd } = computeConcentrationWarning(holdings);
  return { opportunities: annotated, concentrationWarning, totalUsd };
}
