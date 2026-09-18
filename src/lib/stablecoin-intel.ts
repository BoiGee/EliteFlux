// ============================================================
// Stablecoin Supply Intelligence
// ------------------------------------------------------------
// Net minting of USDT/USDC is fresh dollars entering the system —
// almost always destined to buy something soon. Net burning is
// dollars leaving. Tracked via Etherscan's on-chain totalSupply()
// read (real supply, not a proxy), persisted to
// `stablecoin_supply_history` so 24h/7d deltas are measurable.
// ============================================================

import { throttledEtherscanCall } from "./etherscan-throttle.server";

type Admin = { from: (t: string) => any };

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api?chainid=1";

// Ethereum-mainnet only — the majority of USDT supply actually lives on
// Tron, but Ethereum-side mint/burn is still a real, directly measurable
// liquidity signal for the ETH-denominated coin universe this app trades.
const TRACKED_STABLECOINS: { symbol: string; contract: string; decimals: number }[] = [
  { symbol: "USDT", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  { symbol: "USDC", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
];

export interface StablecoinReading {
  symbol: string;
  totalSupply: number;
}

/** Live on-chain total supply for each tracked stablecoin. Null when unconfigured. */
export async function fetchStablecoinSupplies(): Promise<StablecoinReading[] | null> {
  const apiKey = process.env["ETHERSCAN_API_KEY"];
  if (!apiKey) return null;

  const readings = await Promise.all(
    TRACKED_STABLECOINS.map((t): Promise<StablecoinReading | null> =>
      throttledEtherscanCall(async () => {
        try {
          const url = `${ETHERSCAN_V2}&module=stats&action=tokensupply&contractaddress=${t.contract}&apikey=${apiKey}`;
          // throttledEtherscanCall serializes every caller through one
          // shared, module-level queue — if this fetch never settles, that
          // queue is permanently stuck for every future call on this isolate.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8_000);
          const res = await fetch(url, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" }, signal: controller.signal }).finally(() =>
            clearTimeout(timer),
          );
          if (!res.ok) return null;
          const json = (await res.json()) as { status: string; result: string };
          if (json.status !== "1") return null;
          const raw = Number(json.result);
          if (!Number.isFinite(raw) || raw <= 0) return null;
          return { symbol: t.symbol, totalSupply: raw / 10 ** t.decimals };
        } catch {
          return null;
        }
      }),
    ),
  );

  const valid = readings.filter((r): r is StablecoinReading => r !== null);
  return valid.length ? valid : null;
}

let lastPersistAt = 0;
const PERSIST_INTERVAL_MS = 55 * 60_000; // supply barely moves minute to minute — hourly is plenty

/** Best-effort, throttled write so history builds up without hammering the table. */
export async function maybePersistStablecoinSupply(admin: Admin, readings: StablecoinReading[]): Promise<void> {
  if (Date.now() - lastPersistAt < PERSIST_INTERVAL_MS) return;
  lastPersistAt = Date.now();
  try {
    await admin
      .from("stablecoin_supply_history")
      .insert(readings.map((r) => ({ symbol: r.symbol, total_supply: r.totalSupply })));
  } catch {
    /* best effort */
  }
}

export interface StablecoinSupplyIntel {
  perSymbol: Record<string, { current: number; change24hPct: number | null; change7dPct: number | null }>;
  /** 0..100, 50 = neutral. Above 50 = net minting (fresh liquidity, bullish); below = net burning. */
  netLiquidityScore: number;
  totalSupplyUsd: number;
  generatedAt: number;
}

const NEUTRAL: StablecoinSupplyIntel = {
  perSymbol: {},
  netLiquidityScore: 50,
  totalSupplyUsd: 0,
  generatedAt: Date.now(),
};

/** Nearest history row to `target`, only accepted within `toleranceMs` of it. */
function nearestAt(
  rows: { total_supply: number; captured_at: string }[],
  target: number,
  toleranceMs: number,
): number | null {
  let best: { diff: number; supply: number } | null = null;
  for (const r of rows) {
    const diff = Math.abs(new Date(r.captured_at).getTime() - target);
    if (diff <= toleranceMs && (!best || diff < best.diff)) best = { diff, supply: r.total_supply };
  }
  return best?.supply ?? null;
}

/** Fetch the live reading, persist it (throttled), and score it against history. */
export async function getStablecoinSupplyIntel(admin: Admin): Promise<StablecoinSupplyIntel> {
  const current = await fetchStablecoinSupplies();
  if (!current) return NEUTRAL;

  void maybePersistStablecoinSupply(admin, current);

  const now = Date.now();
  const since = new Date(now - 8 * 86400_000).toISOString();
  let rows: { symbol: string; total_supply: number; captured_at: string }[] = [];
  try {
    const { data } = await admin
      .from("stablecoin_supply_history")
      .select("symbol,total_supply,captured_at")
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .limit(2000);
    rows = (data ?? []) as typeof rows;
  } catch {
    /* fall through with no history — deltas stay null */
  }

  const perSymbol: StablecoinSupplyIntel["perSymbol"] = {};
  let weightedChange = 0;
  let totalWeight = 0;
  let totalSupplyUsd = 0;

  for (const c of current) {
    totalSupplyUsd += c.totalSupply;
    const symRows = rows.filter((r) => r.symbol === c.symbol);
    const day = nearestAt(symRows, now - 24 * 3600_000, 6 * 3600_000);
    const week = nearestAt(symRows, now - 7 * 24 * 3600_000, 36 * 3600_000);
    const change24hPct = day && day > 0 ? ((c.totalSupply - day) / day) * 100 : null;
    const change7dPct = week && week > 0 ? ((c.totalSupply - week) / week) * 100 : null;

    perSymbol[c.symbol] = {
      current: c.totalSupply,
      change24hPct: change24hPct !== null ? Math.round(change24hPct * 1000) / 1000 : null,
      change7dPct: change7dPct !== null ? Math.round(change7dPct * 1000) / 1000 : null,
    };

    if (change24hPct !== null) {
      weightedChange += change24hPct * c.totalSupply;
      totalWeight += c.totalSupply;
    }
  }

  const avgChangePct = totalWeight > 0 ? weightedChange / totalWeight : 0;
  // +0.5% minted in 24h is a genuinely large liquidity injection for these two
  // assets — scale so that maps to a strongly bullish score, not a rounding error.
  const netLiquidityScore = Math.round(clamp(50 + avgChangePct * 60, 0, 100));

  return { perSymbol, netLiquidityScore, totalSupplyUsd, generatedAt: now };
}
