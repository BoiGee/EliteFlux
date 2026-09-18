// ============================================================
// On-Chain Wallet Intelligence Layer
// ------------------------------------------------------------
// Derives whale wallet flow, exchange flow, and smart-money
// cluster signals. Today it synthesizes signals from existing
// market microstructure (volume spikes vs. baseline + price
// impact + whale phase) — engineered to be drop-in replaced by
// a real provider (Etherscan / Arkham / Nansen) without
// touching the UI layer. See `fetchOnChainFlows()` stub below.
// ============================================================
import type { MarketSnapshot } from "./market";
import type { HistoryMap } from "./whale-intel";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel } from "./sentiment-intel";
import type { NarrativeIntel } from "./narrative-engine";
import type { PumpPressureIntel } from "./pump-pressure";

export type WalletGroup = "whale" | "exchange" | "smart-money-cluster";
export type Confidence = "low" | "medium" | "high";
export type OnChainSignalType =
  | "whale_accumulation"
  | "whale_distribution"
  | "exchange_inflow_spike"
  | "exchange_outflow_accumulation"
  | "smart_money_cluster"
  | "large_single_transfer";

export interface OnChainSignal {
  id: string;
  type: OnChainSignalType;
  walletGroup: WalletGroup;
  asset: string;
  assetName: string;
  intensity: number; // 0..100
  confidence: Confidence;
  netFlowUsd: number; // positive = inflow to wallets (accumulation), negative = outflow
  exchangeNetUsd: number; // positive = into exchanges (sell pressure)
  walletsInvolved: number;
  rationale: string;
  timestamp: number;
}

export interface OnChainIntel {
  signals: OnChainSignal[];
  perAsset: Record<string, OnChainSignal | undefined>;
  smartMoneyConfidenceIndex: number; // 0..100
  marketConvictionScore: number; // 0..100
  generatedAt: number;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function confidenceFromScore(score: number): Confidence {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/**
 * Known exchange hot wallets on Ethereum — a seed list, not a complete
 * directory. Real whale-tracking products (Arkham, Nansen) maintain and
 * continuously expand exactly this kind of labeled-address database as
 * their core IP; this is a starting point, verify/expand periodically
 * against Etherscan's own "Exchange" labels before trusting it blindly.
 * Override/extend via ETHERSCAN_WATCH_WALLETS (comma-separated "LABEL:addr").
 */
const DEFAULT_EXCHANGE_WALLETS: { label: string; address: string }[] = [
  { label: "Binance", address: "0x28C6c06298d514Db089934071355E5743bf21d60" },
  { label: "Binance", address: "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549" },
  { label: "Binance", address: "0xF977814e90dA44bFA03b6295A0616a897441aceC" },
  { label: "Coinbase", address: "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3" },
  { label: "Coinbase", address: "0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740" },
  { label: "Kraken", address: "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0" },
  { label: "Bybit", address: "0xF89d7b9c864f589bbF53a82105107622B35EaA40" },
];

function exchangeWallets(): { label: string; address: string }[] {
  const override = process.env["ETHERSCAN_WATCH_WALLETS"];
  if (!override) return DEFAULT_EXCHANGE_WALLETS;
  return override
    .split(",")
    .map((entry) => {
      const [label, address] = entry.split(":").map((s) => s.trim());
      return label && address ? { label, address } : null;
    })
    .filter((w): w is { label: string; address: string } => w !== null);
}

interface EtherscanTx {
  from: string;
  to: string;
  value: string;
  timeStamp: string;
}

interface EtherscanTokenTx extends EtherscanTx {
  contractAddress: string;
  tokenDecimal: string;
}

const LOOKBACK_MS = 60 * 60_000; // recent-flow window
const ETH_USD_FALLBACK = 3000; // used only if the caller can't supply a live ETH price
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api?chainid=1"; // V1 (bare /api) is deprecated

// Stablecoins carry most of the real dollar volume through exchange hot
// wallets — a native-ETH-only read would miss the majority of actual flow,
// as verified against real Binance wallet activity while building this.
const TRACKED_TOKENS: { symbol: string; contract: string; decimals: number }[] = [
  { symbol: "USDT", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  { symbol: "USDC", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
];

async function etherscanCall<T>(params: string, apiKey: string): Promise<T[]> {
  // Lazy-imported: onchain-intel.ts is also loaded client-side (for the live
  // dashboard's own computeOnChainIntel), and the throttle is server-only.
  const { throttledEtherscanCall } = await import("./etherscan-throttle.server");
  return throttledEtherscanCall(async () => {
    const url = `${ETHERSCAN_V2}&${params}&apikey=${apiKey}`;
    // throttledEtherscanCall serializes every caller through one shared,
    // module-level queue — if this fetch never settles, that queue is
    // permanently stuck, and every future call from any future invocation
    // on this isolate joins the same dead chain forever. A timeout here is
    // what keeps a single stalled response from poisoning it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" }, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return [];
    }
    const json = (await res.json()) as { status: string; result: T[] | string };
    return json.status === "1" && Array.isArray(json.result) ? json.result : [];
  });
}

/** A single transfer at or above this size is newsworthy on its own — distinct
 * from the netted hourly flow, since one $5M deposit in one shot is a much
 * stronger signal of a decisive actor than ten $500K transfers netting the
 * same total. Whale-alert-style products build their whole product on this. */
const LARGE_TX_THRESHOLD_USD = 2_000_000;

/** The single largest in/out transfer at `address` within the lookback window, if any. */
function largestSingleTransfer(
  txs: EtherscanTx[],
  address: string,
  decimals: number,
  priceUsd: number,
  now: number,
): { usd: number; direction: "in" | "out" } | null {
  let best: { usd: number; direction: "in" | "out" } | null = null;
  for (const tx of txs) {
    const ts = Number(tx.timeStamp) * 1000;
    if (!Number.isFinite(ts) || now - ts > LOOKBACK_MS) continue;
    let value: bigint;
    try {
      value = BigInt(tx.value);
    } catch {
      continue;
    }
    const usd = (Number(value) / 10 ** decimals) * priceUsd;
    if (usd < LARGE_TX_THRESHOLD_USD) continue;
    const direction: "in" | "out" =
      tx.to?.toLowerCase() === address.toLowerCase()
        ? "in"
        : tx.from?.toLowerCase() === address.toLowerCase()
          ? "out"
          : "in";
    if (!best || usd > best.usd) best = { usd, direction };
  }
  return best;
}

function netUsdFlow(txs: EtherscanTx[], address: string, decimals: number, priceUsd: number, now: number): number {
  let inflow = 0n;
  let outflow = 0n;
  for (const tx of txs) {
    const ts = Number(tx.timeStamp) * 1000;
    if (!Number.isFinite(ts) || now - ts > LOOKBACK_MS) continue;
    let value: bigint;
    try {
      value = BigInt(tx.value);
    } catch {
      continue;
    }
    if (tx.to?.toLowerCase() === address.toLowerCase()) inflow += value;
    else if (tx.from?.toLowerCase() === address.toLowerCase()) outflow += value;
  }
  return (Number(inflow - outflow) / 10 ** decimals) * priceUsd;
}

/**
 * Real on-chain read: recent inflow/outflow (native ETH + tracked
 * stablecoins) at known exchange hot wallets, via Etherscan's free API.
 * Deposits into an exchange wallet are sell-pressure (holders moving to
 * sell); withdrawals are accumulation (holders moving to self-custody).
 * Gated on ETHERSCAN_API_KEY — returns null (not an empty array) when
 * unconfigured, so callers can distinguish "no key" from "checked, nothing
 * notable" and fall back to the synthetic proxy without silently
 * overwriting it with a false "no signal".
 */
export async function fetchOnChainFlows(ethPriceUsd?: number): Promise<OnChainSignal[] | null> {
  const apiKey = process.env["ETHERSCAN_API_KEY"];
  if (!apiKey) return null;

  const ethPrice = ethPriceUsd && ethPriceUsd > 0 ? ethPriceUsd : ETH_USD_FALLBACK;
  const wallets = exchangeWallets();
  const now = Date.now();
  const signals: OnChainSignal[] = [];

  await Promise.all(
    wallets.map(async ({ label, address }) => {
      try {
        const [nativeTxs, ...tokenTxLists] = await Promise.all([
          etherscanCall<EtherscanTx>(`module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`, apiKey),
          ...TRACKED_TOKENS.map((t) =>
            etherscanCall<EtherscanTokenTx>(
              `module=account&action=tokentx&contractaddress=${t.contract}&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`,
              apiKey,
            ),
          ),
        ]);

        let netToExchangeUsd = netUsdFlow(nativeTxs, address, 18, ethPrice, now);
        for (let i = 0; i < TRACKED_TOKENS.length; i++) {
          netToExchangeUsd += netUsdFlow(tokenTxLists[i]!, address, TRACKED_TOKENS[i]!.decimals, 1, now);
        }

        const intensity = Math.round(clamp(Math.log10(Math.abs(netToExchangeUsd) + 1) * 10, 0, 100));
        if (intensity >= 20) {
          const type: OnChainSignalType = netToExchangeUsd > 0 ? "exchange_inflow_spike" : "exchange_outflow_accumulation";
          signals.push({
            id: `ETH:${label}:${type}:${now}`,
            type,
            walletGroup: "exchange",
            asset: "ETH",
            assetName: "Ethereum",
            intensity,
            confidence: confidenceFromScore(intensity),
            netFlowUsd: -netToExchangeUsd,
            exchangeNetUsd: netToExchangeUsd,
            walletsInvolved: 1,
            rationale: `${label} hot wallet: ${netToExchangeUsd > 0 ? "net inflow" : "net outflow"} of $${(Math.abs(netToExchangeUsd) / 1e6).toFixed(2)}M (ETH + tracked stablecoins) in the last hour — real on-chain data.`,
            timestamp: now,
          });
        }

        // Whale-alert-style single-transaction spike, independent of the net
        // hourly flow above — catches a single decisive $2M+ move even in a
        // wallet whose net flow nets out close to zero.
        const candidates = [largestSingleTransfer(nativeTxs, address, 18, ethPrice, now)];
        for (let i = 0; i < TRACKED_TOKENS.length; i++) {
          candidates.push(largestSingleTransfer(tokenTxLists[i]!, address, TRACKED_TOKENS[i]!.decimals, 1, now));
        }
        const biggest = candidates
          .filter((c): c is { usd: number; direction: "in" | "out" } => c !== null)
          .sort((a, b) => b.usd - a.usd)[0];
        if (biggest) {
          const alertIntensity = Math.round(clamp(Math.log10(biggest.usd / LARGE_TX_THRESHOLD_USD + 1) * 60 + 40, 0, 100));
          signals.push({
            id: `ETH:${label}:large_single_transfer:${now}`,
            type: "large_single_transfer",
            walletGroup: "whale",
            asset: "ETH",
            assetName: "Ethereum",
            intensity: alertIntensity,
            confidence: confidenceFromScore(alertIntensity),
            netFlowUsd: biggest.direction === "out" ? biggest.usd : -biggest.usd,
            exchangeNetUsd: biggest.direction === "in" ? biggest.usd : -biggest.usd,
            walletsInvolved: 1,
            rationale: `Single $${(biggest.usd / 1e6).toFixed(2)}M transfer ${biggest.direction === "in" ? "into" : "out of"} ${label} hot wallet in the last hour — a decisive whale move, not a netted trickle.`,
            timestamp: now,
          });
        }
      } catch {
        /* one wallet failing is fine — best effort */
      }
    }),
  );

  return signals;
}

export function computeOnChainIntel(
  snapshot: MarketSnapshot,
  history: HistoryMap,
  whale: WhaleIntel,
  sentiment: SentimentIntel,
  narrative: NarrativeIntel,
  pressure: PumpPressureIntel,
  realSignals?: OnChainSignal[] | null,
): OnChainIntel {
  const ts = Date.now();
  const signals: OnChainSignal[] = [];
  const perAsset: Record<string, OnChainSignal | undefined> = {};
  // Real on-chain reads (when configured) take precedence over the synthetic
  // proxy for any asset they cover — genuine data beats an estimate.
  const realCovered = new Set((realSignals ?? []).map((s) => s.asset));

  for (const coin of snapshot.coinIntel) {
    if (realCovered.has(coin.symbol)) continue;
    const hist = history[coin.symbol] ?? [];
    if (hist.length < 5) continue;

    const recent = hist.slice(-3);
    const base = hist.slice(0, -3);
    if (base.length < 2) continue;

    const avgBase = base.reduce((s, x) => s + x.quoteVolume, 0) / base.length || 1;
    const avgRecent = recent.reduce((s, x) => s + x.quoteVolume, 0) / recent.length;
    const volSpike = avgRecent / avgBase;
    const pStart = recent[0].price;
    const pEnd = recent[recent.length - 1].price;
    const pImpact = pStart > 0 ? ((pEnd - pStart) / pStart) * 100 : 0;

    // Heuristic on-chain proxies until a real provider is wired in:
    //  • Rising price + rising volume  → wallets withdrawing from exchanges (accumulation)
    //  • Falling price + rising volume → wallets sending to exchanges (sell pressure)
    //  • Strong vol spike + flat price → cluster pre-positioning (smart money)
    const intensity = Math.round(
      clamp(Math.min(volSpike, 4) * 22 + Math.abs(pImpact) * 4, 0, 100),
    );
    if (intensity < 35) continue;

    const netFlowUsd = (avgRecent - avgBase) * (pImpact >= 0 ? 1 : -1);
    const exchangeNetUsd = (avgRecent - avgBase) * (pImpact >= 0 ? -1 : 1);

    let type: OnChainSignalType;
    let walletGroup: WalletGroup;
    let rationale: string;

    if (volSpike > 1.6 && Math.abs(pImpact) < 0.6) {
      type = "smart_money_cluster";
      walletGroup = "smart-money-cluster";
      rationale = `Volume surged ${volSpike.toFixed(2)}× with flat price — coordinated positioning.`;
    } else if (pImpact >= 0.4 && volSpike >= 1.25) {
      type = "exchange_outflow_accumulation";
      walletGroup = "whale";
      rationale = `Net outflow from exchanges (~$${(Math.abs(exchangeNetUsd) / 1e6).toFixed(1)}M proxy) with +${pImpact.toFixed(2)}% drift.`;
    } else if (pImpact <= -0.4 && volSpike >= 1.25) {
      type = "exchange_inflow_spike";
      walletGroup = "exchange";
      rationale = `Inflow to exchanges (~$${(Math.abs(exchangeNetUsd) / 1e6).toFixed(1)}M proxy) — potential sell pressure.`;
    } else if (pImpact >= 0.2) {
      type = "whale_accumulation";
      walletGroup = "whale";
      rationale = `Whale wallets accumulating; volume ${volSpike.toFixed(2)}× baseline.`;
    } else {
      type = "whale_distribution";
      walletGroup = "whale";
      rationale = `Whale wallets distributing; price impact ${pImpact.toFixed(2)}%.`;
    }

    const sig: OnChainSignal = {
      id: `${coin.symbol}:${type}:${ts}`,
      type,
      walletGroup,
      asset: coin.symbol,
      assetName: coin.name,
      intensity,
      confidence: confidenceFromScore(intensity),
      netFlowUsd,
      exchangeNetUsd,
      walletsInvolved: Math.max(3, Math.round(volSpike * 4 + Math.abs(pImpact))),
      rationale,
      timestamp: ts,
    };
    signals.push(sig);
    perAsset[coin.symbol] = sig;
  }

  for (const real of realSignals ?? []) {
    signals.push(real);
    perAsset[real.asset] = real;
  }

  signals.sort((a, b) => b.intensity - a.intensity);

  // ----- Fusion scoring -----
  // Smart Money Confidence Index — how strongly on-chain + whale + smart cluster agree
  const accum = signals.filter(
    (s) =>
      s.type === "whale_accumulation" ||
      s.type === "exchange_outflow_accumulation" ||
      (s.type === "large_single_transfer" && s.netFlowUsd > 0),
  ).length;
  const dist = signals.filter(
    (s) =>
      s.type === "whale_distribution" ||
      s.type === "exchange_inflow_spike" ||
      (s.type === "large_single_transfer" && s.netFlowUsd < 0),
  ).length;
  const clusters = signals.filter((s) => s.type === "smart_money_cluster").length;
  const flowBias = signals.length > 0 ? (accum - dist) / Math.max(signals.length, 1) : 0; // -1..1
  const whaleBias = whale.phase === "Accumulation" ? 1 : whale.phase === "Distribution" ? -1 : 0;

  const smartMoneyConfidenceIndex = Math.round(
    clamp(50 + flowBias * 30 + whaleBias * 12 + clusters * 4 + (whale.score - 50) * 0.2),
  );

  // Market Conviction Score — fusion of on-chain bias + sentiment + narrative + pressure
  const marketConvictionScore = Math.round(
    clamp(
      smartMoneyConfidenceIndex * 0.35 +
        sentiment.score * 0.2 +
        narrative.aggregateStrength * 0.2 +
        pressure.score * 0.15 +
        whale.score * 0.1,
    ),
  );

  return {
    signals,
    perAsset,
    smartMoneyConfidenceIndex,
    marketConvictionScore,
    generatedAt: ts,
  };
}
