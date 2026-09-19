import { describe, expect, it } from "vitest";
import { runEliteBrain } from "../elite-brain";
import type { CategoryFlow, CoinIntel, MarketSnapshot } from "../market";

function flow(id: string, momentum: number): CategoryFlow {
  return { id, name: id, momentum, flow: "inflow", risk: "Medium", trend: "up", change24h: 0, marketShare: 10 };
}

function coin(symbol: string): CoinIntel {
  return {
    symbol,
    name: symbol,
    category: "Large Cap",
    price: 100,
    change24h: 0,
    momentum: 0,
    risk: "Medium",
    btcCorrelation: "High",
    flow: "Accumulation",
  };
}

const baseSnapshot: MarketSnapshot = {
  marketOverview: {
    btcPrice: 60_000,
    btcChange24h: 0.5,
    btcTrend: "neutral",
    btcDominance: 50,
    btcDominanceChange: 0,
    sentiment: { score: 50, label: "Neutral" },
    liquidityFlow: { target: "Bitcoin", strength: 50 },
    totalMarketCap: 2_000_000_000_000,
    marketCapChange: 0,
    volume24h: 100_000_000_000,
  },
  categoryFlows: [],
  narratives: [],
  coinIntel: [coin("BTC")],
  memeCoins: [],
  tickerStream: [],
};

// memeShare and altShare are each independently clamped 0..100, but nothing
// previously bounded their SUM before deriving btcShare from the remainder —
// when both categories ran hot at once, the three reported liquidity shares
// could add up to more than 100 (btcShare floored at 0 rather than the pair
// being scaled back), a misleading breakdown on a user-facing widget
// presented as a 3-way split of the same 100%. Confirmed live via code
// audit; fixed by rescaling meme/alt proportionally when their sum would
// overflow.
describe("runEliteBrain liquidity flow layer", () => {
  it("keeps btcShare + altShare + memeShare at exactly 100 when meme and alt momentum both run hot", () => {
    const snapshot: MarketSnapshot = {
      ...baseSnapshot,
      categoryFlows: [flow("meme", 100), flow("mid", 100), flow("ai", 100), flow("large", 50)],
    };
    const out = runEliteBrain(snapshot);
    const { btcShare, altShare, memeShare } = out.liquidity;
    expect(btcShare + altShare + memeShare).toBeCloseTo(100, 5);
    expect(btcShare).toBeGreaterThanOrEqual(0);
    expect(altShare).toBeGreaterThanOrEqual(0);
    expect(memeShare).toBeGreaterThanOrEqual(0);
  });

  it("still sums to 100 in the ordinary case where meme/alt momentum is low", () => {
    const snapshot: MarketSnapshot = {
      ...baseSnapshot,
      categoryFlows: [flow("meme", 10), flow("mid", 5), flow("ai", 5), flow("large", 20)],
    };
    const out = runEliteBrain(snapshot);
    const { btcShare, altShare, memeShare } = out.liquidity;
    expect(btcShare + altShare + memeShare).toBeCloseTo(100, 5);
  });
});
