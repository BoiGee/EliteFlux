import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { computeWhaleIntel, WHALE_METHODOLOGY, type HistoryMap, type WhaleIntel } from "./whale-intel";
import { computeConfidence, layerAgreement, type ConfidenceResult } from "./model-calibration";
import { computeSentimentIntel, type SentimentIntel } from "./sentiment-intel";
import { runEliteBrain, type EliteBrainOutput } from "./elite-brain";
import { computeNarrativeIntel, type NarrativeIntel } from "./narrative-engine";
import { computeMomentumIgnition, type MomentumIgnitionIntel } from "./momentum-ignition";
import { computeSmartMoney, type SmartMoneyIntel } from "./smart-money";
import { computePumpPressure, type PumpPressureIntel } from "./pump-pressure";
import { runEliteBrainV3, type EliteBrainV3Output, type RegimeV3 } from "./elite-brain-v3";
import { computeOnChainIntel, type OnChainIntel } from "./onchain-intel";
import { computeExitIntel, type ExitIntel } from "./exit-intel";
import {
  computeRecommendations,
  diffRecommendationAlerts,
  type RecommendationOutput,
  type RecommendationAlert,
  type PrevRanking,
} from "./recommendation-engine";
import {
  brainToIntelSnapshot,
  diffEvents,
  type EventSignal,
  type IntelSnapshot,
} from "./event-signals";


// ============================================================
// Types
// ============================================================
export type Category = "AI" | "Meme" | "L1" | "Large Cap" | "RWA" | "Infra";
export type Trend = "bullish" | "bearish" | "neutral";
export type RiskLevel = "Low" | "Medium" | "High";
export type FlowDirection = "inflow" | "outflow";
export type SentimentLabel =
  | "Extreme Fear"
  | "Fear"
  | "Neutral"
  | "Greed"
  | "Extreme Greed";

export interface CoinMeta {
  symbol: string;
  name: string;
  binance?: string; // e.g. BTCUSDT
  coingecko: string; // CoinGecko id
  category: Category;
  narrativeId: string;
  memeTags?: ("Hype-driven" | "Whale-controlled" | "High volatility")[];
}

export interface Ticker {
  price: number;
  change24h: number;
  volume: number; // base asset volume
  quoteVolume: number; // USDT volume
  high24h: number;
  low24h: number;
}

export interface MarketOverview {
  btcPrice: number;
  btcChange24h: number;
  btcTrend: Trend;
  btcDominance: number;
  btcDominanceChange: number;
  sentiment: { score: number; label: SentimentLabel };
  liquidityFlow: { target: "Bitcoin" | "Altcoins" | "Meme Coins"; strength: number };
  totalMarketCap: number;
  marketCapChange: number;
  volume24h: number;
}

export interface CategoryFlow {
  id: string;
  name: string;
  momentum: number;
  flow: FlowDirection;
  risk: RiskLevel;
  trend: "up" | "down" | "flat";
  change24h: number;
  marketShare: number;
}

export interface MemeCoin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volumeSpike: number;
  socialHype: number;
  tags: ("Hype-driven" | "Whale-controlled" | "High volatility")[];
}

export interface Narrative {
  id: string;
  name: string;
  strength: number;
  direction: "rising" | "fading" | "stable";
  description: string;
  topCoins: string[];
}

export interface CoinIntel {
  symbol: string;
  name: string;
  category: Category;
  price: number;
  change24h: number;
  momentum: number;
  risk: RiskLevel;
  btcCorrelation: "High" | "Medium" | "Low";
  flow: "Accumulation" | "Distribution";
}

export interface TickerStreamItem {
  sym: string;
  price: number;
  ch: number;
}

// ============================================================
// Coin Universe
// ============================================================
export const COIN_UNIVERSE: CoinMeta[] = [
  { symbol: "BTC", name: "Bitcoin", binance: "BTCUSDT", coingecko: "bitcoin", category: "Large Cap", narrativeId: "btc" },
  { symbol: "ETH", name: "Ethereum", binance: "ETHUSDT", coingecko: "ethereum", category: "Large Cap", narrativeId: "l1" },
  { symbol: "BNB", name: "BNB", binance: "BNBUSDT", coingecko: "binancecoin", category: "Large Cap", narrativeId: "l1" },
  { symbol: "XRP", name: "XRP", binance: "XRPUSDT", coingecko: "ripple", category: "Large Cap", narrativeId: "l1" },
  { symbol: "SOL", name: "Solana", binance: "SOLUSDT", coingecko: "solana", category: "L1", narrativeId: "l1" },
  { symbol: "ADA", name: "Cardano", binance: "ADAUSDT", coingecko: "cardano", category: "L1", narrativeId: "l1" },
  { symbol: "AVAX", name: "Avalanche", binance: "AVAXUSDT", coingecko: "avalanche-2", category: "L1", narrativeId: "l1" },
  { symbol: "SUI", name: "Sui", binance: "SUIUSDT", coingecko: "sui", category: "L1", narrativeId: "l1" },
  { symbol: "APT", name: "Aptos", binance: "APTUSDT", coingecko: "aptos", category: "L1", narrativeId: "l1" },
  { symbol: "TON", name: "Toncoin", binance: "TONUSDT", coingecko: "the-open-network", category: "L1", narrativeId: "l1" },
  { symbol: "LINK", name: "Chainlink", binance: "LINKUSDT", coingecko: "chainlink", category: "Infra", narrativeId: "infra" },
  { symbol: "FET", name: "Fetch.ai", binance: "FETUSDT", coingecko: "fetch-ai", category: "AI", narrativeId: "ai" },
  { symbol: "RENDER", name: "Render", binance: "RENDERUSDT", coingecko: "render-token", category: "AI", narrativeId: "ai" },
  { symbol: "TAO", name: "Bittensor", binance: "TAOUSDT", coingecko: "bittensor", category: "AI", narrativeId: "ai" },
  { symbol: "DOGE", name: "Dogecoin", binance: "DOGEUSDT", coingecko: "dogecoin", category: "Meme", narrativeId: "meme", memeTags: ["Hype-driven"] },
  { symbol: "PEPE", name: "Pepe", binance: "PEPEUSDT", coingecko: "pepe", category: "Meme", narrativeId: "meme", memeTags: ["Hype-driven", "High volatility"] },
  { symbol: "WIF", name: "dogwifhat", binance: "WIFUSDT", coingecko: "dogwifcoin", category: "Meme", narrativeId: "meme", memeTags: ["Hype-driven"] },
  { symbol: "BONK", name: "Bonk", binance: "BONKUSDT", coingecko: "bonk", category: "Meme", narrativeId: "meme", memeTags: ["Whale-controlled", "High volatility"] },
  { symbol: "FLOKI", name: "Floki", binance: "FLOKIUSDT", coingecko: "floki", category: "Meme", narrativeId: "meme", memeTags: ["Whale-controlled"] },
  { symbol: "ONDO", name: "Ondo Finance", binance: "ONDOUSDT", coingecko: "ondo-finance", category: "RWA", narrativeId: "rwa" },
];

const NARRATIVE_META: Record<string, { name: string; description: string }> = {
  btc: { name: "Bitcoin Reserve", description: "Macro reserve asset, ETF flow anchor." },
  ai: { name: "AI Narrative", description: "Compute, agents, decentralized inference." },
  meme: { name: "Meme Season", description: "Retail risk-on rotation dynamics." },
  l1: { name: "Layer 1 Wars", description: "Throughput, execution layer competition." },
  rwa: { name: "Real World Assets", description: "TradFi rails meeting on-chain settlement." },
  infra: { name: "Infrastructure", description: "Oracles, data, middleware layers." },
};

// ============================================================
// Fetch helpers
// ============================================================
const BINANCE_REST = "https://api.binance.com/api/v3";
const BINANCE_WS = "wss://stream.binance.com:9443/stream";
const COINGECKO = "https://api.coingecko.com/api/v3";
const FNG = "https://api.alternative.me/fng/?limit=1";

interface BinanceTicker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

async function fetchBinance24h(symbols: string[]): Promise<Record<string, Ticker>> {
  const list = JSON.stringify(symbols);
  const url = `${BINANCE_REST}/ticker/24hr?symbols=${encodeURIComponent(list)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const arr = (await res.json()) as BinanceTicker24h[];
  const out: Record<string, Ticker> = {};
  for (const t of arr) {
    out[t.symbol] = {
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
    };
  }
  return out;
}

interface GlobalData {
  btcDominance: number;
  totalMarketCap: number;
  marketCapChange: number;
  totalVolume: number;
}

async function fetchCoinGeckoGlobal(): Promise<GlobalData | null> {
  try {
    const res = await fetch(`${COINGECKO}/global`);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data;
    return {
      btcDominance: d.market_cap_percentage.btc,
      totalMarketCap: d.total_market_cap.usd,
      marketCapChange: d.market_cap_change_percentage_24h_usd,
      totalVolume: d.total_volume.usd,
    };
  } catch {
    return null;
  }
}

async function fetchCoinGeckoFallback(ids: string[]): Promise<Record<string, Ticker>> {
  if (ids.length === 0) return {};
  try {
    const url = `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids.join(",")}&price_change_percentage=24h`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const arr = await res.json();
    const out: Record<string, Ticker> = {};
    for (const c of arr) {
      out[c.id] = {
        price: c.current_price,
        change24h: c.price_change_percentage_24h ?? 0,
        volume: c.total_volume ?? 0,
        quoteVolume: c.total_volume ?? 0,
        high24h: c.high_24h ?? c.current_price,
        low24h: c.low_24h ?? c.current_price,
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchFearGreed(): Promise<{ score: number; label: SentimentLabel } | null> {
  try {
    const res = await fetch(FNG);
    if (!res.ok) return null;
    const json = await res.json();
    const item = json.data?.[0];
    if (!item) return null;
    const score = parseInt(item.value, 10);
    const label = (item.value_classification as SentimentLabel) ?? "Neutral";
    return { score, label };
  } catch {
    return null;
  }
}

// ============================================================
// Derivation
// ============================================================
function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function tickerFor(meta: CoinMeta, tickers: Record<string, Ticker>): Ticker | null {
  if (meta.binance && tickers[meta.binance]) return tickers[meta.binance];
  if (tickers[meta.coingecko]) return tickers[meta.coingecko];
  return null;
}

function momentumScore(change: number, quoteVolume: number, refVol: number): number {
  const changePart = clamp(50 + change * 3, 0, 100);
  const volPart = clamp((quoteVolume / Math.max(refVol, 1)) * 50, 0, 50);
  return Math.round(clamp(changePart * 0.7 + volPart * 0.6));
}

function riskFor(change: number, category: Category): RiskLevel {
  const a = Math.abs(change);
  if (category === "Meme" || a > 10) return "High";
  if (a > 4 || category === "AI") return "Medium";
  return "Low";
}

function btcCorrelationFor(category: Category): "High" | "Medium" | "Low" {
  if (category === "Large Cap") return "High";
  if (category === "Meme" || category === "AI") return "Low";
  return "Medium";
}

export interface MarketSnapshot {
  marketOverview: MarketOverview;
  categoryFlows: CategoryFlow[];
  narratives: Narrative[];
  coinIntel: CoinIntel[];
  memeCoins: MemeCoin[];
  tickerStream: TickerStreamItem[];
}

export function deriveSnapshot(
  tickers: Record<string, Ticker>,
  global: GlobalData | null,
  prevGlobal: GlobalData | null,
  sentiment: { score: number; label: SentimentLabel } | null,
): MarketSnapshot {
  const btc = tickers["BTCUSDT"];
  const btcPrice = btc?.price ?? 0;
  const btcChange = btc?.change24h ?? 0;
  const btcTrend: Trend = btcChange > 1 ? "bullish" : btcChange < -1 ? "bearish" : "neutral";
  const btcDominance = global?.btcDominance ?? 0;
  const btcDominanceChange = prevGlobal ? +(btcDominance - prevGlobal.btcDominance).toFixed(2) : 0;

  const coins = COIN_UNIVERSE.map((meta) => {
    const t = tickerFor(meta, tickers);
    return { meta, t };
  }).filter((x): x is { meta: CoinMeta; t: Ticker } => !!x.t);

  const refVol = Math.max(...coins.map((c) => c.t.quoteVolume), 1);

  const coinIntel: CoinIntel[] = coins.map(({ meta, t }) => {
    const momentum = momentumScore(t.change24h, t.quoteVolume, refVol);
    return {
      symbol: meta.symbol,
      name: meta.name,
      category: meta.category,
      price: t.price,
      change24h: +t.change24h.toFixed(2),
      momentum,
      risk: riskFor(t.change24h, meta.category),
      btcCorrelation: btcCorrelationFor(meta.category),
      flow: t.change24h >= 0 ? "Accumulation" : "Distribution",
    };
  });

  const catIds: Array<{ id: string; cat: Category; name: string }> = [
    { id: "large", cat: "Large Cap", name: "Large Cap" },
    { id: "mid", cat: "L1", name: "Layer 1" },
    { id: "ai", cat: "AI", name: "AI Tokens" },
    { id: "meme", cat: "Meme", name: "Meme Coins" },
    { id: "infra", cat: "Infra", name: "Infrastructure" },
    { id: "rwa", cat: "RWA", name: "RWA" },
  ];

  const totalQuoteVol = coins.reduce((s, c) => s + c.t.quoteVolume, 0) || 1;

  const categoryFlows: CategoryFlow[] = catIds
    .map(({ id, cat, name }) => {
      const group = coins.filter((c) => c.meta.category === cat);
      if (group.length === 0) return null;
      const avgChange = group.reduce((s, c) => s + c.t.change24h, 0) / group.length;
      const groupVol = group.reduce((s, c) => s + c.t.quoteVolume, 0);
      const avgMomentum = group.reduce((s, c) => s + momentumScore(c.t.change24h, c.t.quoteVolume, refVol), 0) / group.length;
      return {
        id,
        name,
        momentum: Math.round(avgMomentum),
        flow: avgChange >= 0 ? "inflow" : "outflow",
        risk: cat === "Meme" ? "High" : cat === "AI" || cat === "L1" ? "Medium" : "Low",
        trend: avgChange > 0.5 ? "up" : avgChange < -0.5 ? "down" : "flat",
        change24h: +avgChange.toFixed(2),
        marketShare: Math.round((groupVol / totalQuoteVol) * 100),
      };
    })
    .filter((x): x is CategoryFlow => x !== null);

  const narrativeIds = Array.from(new Set(COIN_UNIVERSE.map((m) => m.narrativeId)));
  const narratives: Narrative[] = narrativeIds
    .map((id) => {
      const meta = NARRATIVE_META[id];
      if (!meta) return null;
      const group = coins.filter((c) => c.meta.narrativeId === id);
      if (group.length === 0) return null;
      const avgChange = group.reduce((s, c) => s + c.t.change24h, 0) / group.length;
      const strength = Math.round(clamp(50 + avgChange * 4));
      const direction = avgChange > 1.5 ? "rising" : avgChange < -1.5 ? "fading" : "stable";
      const topCoins = group.slice().sort((a, b) => b.t.change24h - a.t.change24h).slice(0, 3).map((c) => c.meta.symbol);
      return { id, name: meta.name, strength, direction, description: meta.description, topCoins };
    })
    .filter((x): x is Narrative => x !== null);

  const memeCoins: MemeCoin[] = coins
    .filter((c) => c.meta.category === "Meme")
    .map(({ meta, t }) => {
      const volumeSpike = Math.round(clamp((t.quoteVolume / Math.max(refVol, 1)) * 500, 20, 999));
      const socialHype = Math.round(clamp(50 + t.change24h * 2 + (volumeSpike / 10), 0, 100));
      const tags = meta.memeTags ?? ["Hype-driven"];
      const finalTags = Math.abs(t.change24h) > 10 && !tags.includes("High volatility") ? [...tags, "High volatility"] as MemeCoin["tags"] : tags;
      return { symbol: meta.symbol, name: meta.name, price: t.price, change24h: +t.change24h.toFixed(2), volumeSpike, socialHype, tags: finalTags };
    })
    .sort((a, b) => b.socialHype - a.socialHype);

  const largeChange = categoryFlows.find((c) => c.id === "large")?.change24h ?? 0;
  const altChange = (categoryFlows.find((c) => c.id === "mid")?.change24h ?? 0) + (categoryFlows.find((c) => c.id === "ai")?.change24h ?? 0);
  const memeChange = categoryFlows.find((c) => c.id === "meme")?.change24h ?? 0;
  const target: MarketOverview["liquidityFlow"]["target"] = memeChange > altChange && memeChange > largeChange ? "Meme Coins" : altChange > largeChange ? "Altcoins" : "Bitcoin";
  const strength = Math.round(clamp(50 + Math.max(memeChange, altChange, largeChange) * 4));

  const tickerStream: TickerStreamItem[] = coins.slice().sort((a, b) => b.t.quoteVolume - a.t.quoteVolume).slice(0, 12).map(({ meta, t }) => ({ sym: meta.symbol, price: t.price, ch: +t.change24h.toFixed(2) }));

  const sent = sentiment ?? { score: 50, label: "Neutral" as SentimentLabel };

  const marketOverview: MarketOverview = {
    btcPrice,
    btcChange24h: +btcChange.toFixed(2),
    btcTrend,
    btcDominance: +btcDominance.toFixed(2),
    btcDominanceChange,
    sentiment: sent,
    liquidityFlow: { target, strength },
    totalMarketCap: global?.totalMarketCap ?? 0,
    marketCapChange: +(global?.marketCapChange ?? 0).toFixed(2),
    volume24h: global?.totalVolume ?? totalQuoteVol,
  };

  return { marketOverview, categoryFlows, narratives, coinIntel, memeCoins, tickerStream };
}

const EMPTY_SNAPSHOT: MarketSnapshot = {
  marketOverview: { btcPrice: 0, btcChange24h: 0, btcTrend: "neutral", btcDominance: 0, btcDominanceChange: 0, sentiment: { score: 50, label: "Neutral" }, liquidityFlow: { target: "Bitcoin", strength: 50 }, totalMarketCap: 0, marketCapChange: 0, volume24h: 0 },
  categoryFlows: [], narratives: [], coinIntel: [], memeCoins: [], tickerStream: [],
};

interface LiveMarketContextValue {
  snapshot: MarketSnapshot;
  isLive: boolean;
  lastUpdate: number;
  error: string | null;
  whale: WhaleIntel;
  sentiment: SentimentIntel;
  brain: EliteBrainOutput;
  events: EventSignal[];
  history: HistoryMap;
  narrative: NarrativeIntel;
  ignition: MomentumIgnitionIntel;
  smartMoney: SmartMoneyIntel;
  pressure: PumpPressureIntel;
  brainV3: EliteBrainV3Output;
  onchain: OnChainIntel;
  recommendations: RecommendationOutput;
  recommendationAlerts: RecommendationAlert[];
  exit: ExitIntel;
  /** How much this read can be trusted right now, and why. */
  confidence: ConfidenceResult;
}

/** Server-computed enhancement layers (derivatives, order book, social, crowd) from the shared feed. */
export interface ExtraFeed {
  derivatives: Record<string, { score: number; crowding: string }>;
  orderbook: Record<string, { score: number; imbalance: number }>;
  social: Record<string, { score: number; trending: boolean }>;
  crowd: Record<string, { score: number; net: number }>;
  stablecoin?: { netLiquidityScore: number };
  confluence?: Record<string, { score: number; direction: string }>;
  options?: Record<string, { score: number }>;
  macro?: { score: number };
  volatility?: Record<string, { regime: string }>;
  crossExchange?: Record<string, { score: number }>;
  communityTrust?: Record<string, { score: number }>;
}

const EMPTY_EXIT: ExitIntel = {
  assets: [],
  perAsset: {},
  marketExitPressure: 0,
  marketBand: "Strong Hold",
  marketPhase: "Accumulation",
  reversalWindow: "No elevated reversal signal in the current cycle phase",
  systemMessages: [],
  generatedAt: 0,
};

const EMPTY_ONCHAIN: OnChainIntel = {
  signals: [],
  perAsset: {},
  smartMoneyConfidenceIndex: 50,
  marketConvictionScore: 50,
  generatedAt: 0,
};

const EMPTY_RECS: RecommendationOutput = {
  opportunities: [],
  global: { regime: "Mixed", btcDominanceState: "Stable", sentimentState: "Neutral", liquidityFlow: "Mixed" },
  generatedAt: 0,
};

const EMPTY_WHALE: WhaleIntel = {
  score: 0,
  phase: "Neutral",
  impact: "Low",
  topSignals: [],
  accumulating: 0,
  distributing: 0,
  methodology: WHALE_METHODOLOGY,
};

const EMPTY_SENTIMENT: SentimentIntel = {
  score: 50,
  state: "Neutral",
  trend: "Stable",
  components: { priceAcceleration: 50, volumeExpansion: 50, volatilitySpike: 50, momentumConsistency: 50, fearGreed: null },
  socialOverlay: null,
};

const EMPTY_NARRATIVE: NarrativeIntel = { detected: [], topEmerging: [], aggregateStrength: 50, rotationVelocity: 0 };
const EMPTY_IGNITION: MomentumIgnitionIntel = {
  signals: [],
  topByStage: {
    Dormant: [],
    "Speculative Accumulation": [],
    "Pre-Breakout Conditions": [],
    "Early Momentum Detected": [],
    "Active Breakout": [],
  },
  sectorSync: 50,
  ignitionScore: 25,
};
const EMPTY_SMART: SmartMoneyIntel = {
  clusters: [],
  confidenceScore: 25,
  dominantClass: "Mixed Flow / Uncertain",
  coordinationIndex: 0,
  methodology: WHALE_METHODOLOGY,
};
const EMPTY_PRESSURE: PumpPressureIntel = {
  score: 0,
  band: "Low",
  contributors: {
    liquidityInflow: 50,
    sentimentAccel: 50,
    volumeExpansion: 50,
    narrativeStrength: 50,
    whaleAlignment: 50,
    momentumIgnition: 25,
  },
  rationale: "Awaiting data",
};
const EMPTY_BRAIN_V3: EliteBrainV3Output = {
  regime: "Accumulation Phase (Smart Money Entry)",
  confidence: 50,
  cognitionScore: 50,
  signals: ["Awaiting data"],
  transition: null,
  vector: { whale: 0, sentiment: 50, narrative: 50, ignition: 25, pressure: 0, smartMoney: 25 },
};

const LiveMarketContext = createContext<LiveMarketContextValue>({
  snapshot: EMPTY_SNAPSHOT,
  isLive: false,
  lastUpdate: 0,
  error: null,
  whale: EMPTY_WHALE,
  sentiment: EMPTY_SENTIMENT,
  brain: runEliteBrain(EMPTY_SNAPSHOT, EMPTY_WHALE, EMPTY_SENTIMENT),
  events: [],
  history: {},
  narrative: EMPTY_NARRATIVE,
  ignition: EMPTY_IGNITION,
  smartMoney: EMPTY_SMART,
  pressure: EMPTY_PRESSURE,
  brainV3: EMPTY_BRAIN_V3,
  onchain: EMPTY_ONCHAIN,
  recommendations: EMPTY_RECS,
  recommendationAlerts: [],
  exit: EMPTY_EXIT,
  confidence: { score: 0, band: "Low", reasons: ["waiting for the first market read"] },
});


export function useLiveMarket() {
  return useContext(LiveMarketContext);
}

export function useEliteIntel() {
  const v = useContext(LiveMarketContext);
  return {
    snapshot: v.snapshot,
    whale: v.whale,
    sentiment: v.sentiment,
    brain: v.brain,
    events: v.events,
    history: v.history,
    isLive: v.isLive,
    lastUpdate: v.lastUpdate,
    narrative: v.narrative,
    ignition: v.ignition,
    smartMoney: v.smartMoney,
    pressure: v.pressure,
    brainV3: v.brainV3,
    onchain: v.onchain,
    recommendations: v.recommendations,
    recommendationAlerts: v.recommendationAlerts,
    exit: v.exit,
    confidence: v.confidence,
  };
}


const HISTORY_LIMIT = 24; // ~36s window at 1.5s flush

export function LiveMarketProvider({ children }: { children: ReactNode }) {
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [global, setGlobal] = useState<GlobalData | null>(null);
  const [prevGlobal, setPrevGlobal] = useState<GlobalData | null>(null);
  const [sentimentRaw, setSentimentRaw] = useState<{ score: number; label: SentimentLabel } | null>(null);
  const [extraFeed, setExtraFeed] = useState<ExtraFeed | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [history, setHistory] = useState<HistoryMap>({});
  const [events, setEvents] = useState<EventSignal[]>([]);
  const [prevSentimentScore, setPrevSentimentScore] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tickersRef = useRef<Record<string, Ticker>>({});
  const prevIntelRef = useRef<IntelSnapshot | null>(null);

  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);

  useEffect(() => {
    let cancelled = false;
    const binanceSymbols = COIN_UNIVERSE.filter((c) => c.binance).map((c) => c.binance!);

    // Primary path: one shared, server-cached feed. Every visitor reads the
    // same cached payload, so provider load no longer scales with traffic.
    async function loadFromFeed(): Promise<boolean> {
      try {
        const res = await fetch("/api/public/market-feed");
        if (!res.ok) return false;
        const j = (await res.json()) as {
          tickers?: Record<string, Ticker>;
          global?: GlobalData | null;
          sentiment?: { score: number; label: SentimentLabel } | null;
          extra?: ExtraFeed;
        };
        if (cancelled) return true;
        const bin = j.tickers ?? {};
        if (Object.keys(bin).length === 0) return false;
        setTickers((prev) => ({ ...prev, ...bin }));
        if (j.global) {
          setPrevGlobal((p) => p ?? j.global!);
          setGlobal(j.global);
        }
        if (j.sentiment) setSentimentRaw(j.sentiment);
        if (j.extra) setExtraFeed(j.extra);
        setIsLive(true);
        setError(null);
        setLastUpdate(Date.now());
        return true;
      } catch {
        return false;
      }
    }

    // Fallback path: only used when the shared feed itself is unreachable.
    async function loadDirect() {
      const [binRes, glob, sent] = await Promise.all([
        fetchBinance24h(binanceSymbols).catch(() => ({}) as Record<string, Ticker>),
        fetchCoinGeckoGlobal(),
        fetchFearGreed(),
      ]);
      if (cancelled) return;
      const bin = binRes;
      const missing = COIN_UNIVERSE.filter((c) => !c.binance || !bin[c.binance]);
      if (missing.length > 0) {
        const cgIds = missing.map((m) => m.coingecko);
        const fb = await fetchCoinGeckoFallback(cgIds);
        if (cancelled) return;
        Object.assign(bin, fb);
      }
      if (Object.keys(bin).length === 0) {
        setError("Market data temporarily unavailable. Retrying…");
        return;
      }
      setTickers((prev) => ({ ...prev, ...bin }));
      if (glob) {
        setPrevGlobal((p) => p ?? glob);
        setGlobal(glob);
      }
      if (sent) setSentimentRaw(sent);
      setIsLive(true);
      setError(null);
      setLastUpdate(Date.now());
    }

    async function loadAll() {
      const ok = await loadFromFeed();
      if (!ok && !cancelled) await loadDirect();
    }

    loadAll();
    const restInterval = setInterval(loadAll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(restInterval);
    };
  }, []);



  useEffect(() => {
    if (typeof window === "undefined") return;
    // Per-visitor streaming is an optional enhancement, not the source of
    // truth — the shared server feed above is. Off by default so a large
    // audience doesn't open one upstream socket per browser tab.
    if (import.meta.env["VITE_ENABLE_MARKET_WS"] !== "true") return;

    const symbols = COIN_UNIVERSE.filter((c) => c.binance).map((c) => c.binance!.toLowerCase());
    const streams = symbols.map((s) => `${s}@ticker`).join("/");
    const url = `${BINANCE_WS}?streams=${streams}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;

    function connect() {
      try {
        ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => setIsLive(true);
        ws.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data);
            const d = parsed.data;
            if (!d || !d.s) return;
            const sym: string = d.s;
            const next: Ticker = {
              price: parseFloat(d.c),
              change24h: parseFloat(d.P),
              volume: parseFloat(d.v),
              quoteVolume: parseFloat(d.q),
              high24h: parseFloat(d.h),
              low24h: parseFloat(d.l),
            };
            tickersRef.current = { ...tickersRef.current, [sym]: next };
          } catch {}
        };
        ws.onerror = () => {
          /* WS may be blocked in some regions; REST polling continues in background */
        };

        ws.onclose = () => {
          if (closedByUs) return;
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();
    // Every flush creates a new `tickers` object, which cascades through
    // `snapshot` (deriveSnapshot always returns a new reference) and from
    // there through every one of this provider's ~15 useMemo layers
    // (whale/sentiment/brain/narrative/ignition/smartMoney/brainV3/exit/
    // recommendations/confidence/...) on every currently-mounted dashboard
    // component — confirmed by a performance audit as a real, measurable
    // cost, not a style concern. 3s instead of 1.5s halves that recompute
    // frequency with no architecture change; a selector-based context split
    // (so a component only re-renders on ITS OWN slice changing) would cut
    // it further but is a materially bigger, separate change across the ~21
    // files that consume this context — intentionally not attempted here.
    const flush = setInterval(() => {
      setTickers({ ...tickersRef.current });
      setLastUpdate(Date.now());
    }, 3000);

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(flush);
      ws?.close();
      wsRef.current = null;
    };
  }, []);

  const snapshot = useMemo(
    () => deriveSnapshot(tickers, global, prevGlobal, sentimentRaw),
    [tickers, global, prevGlobal, sentimentRaw],
  );

  // Maintain rolling per-symbol history for whale + sentiment derivation
  useEffect(() => {
    if (snapshot.coinIntel.length === 0) return;
    setHistory((prev) => {
      const next: HistoryMap = { ...prev };
      const ts = Date.now();
      for (const c of snapshot.coinIntel) {
        const t = tickers[`${c.symbol}USDT`] ?? tickers[c.symbol];
        const qv = t?.quoteVolume ?? 0;
        const arr = next[c.symbol] ? [...next[c.symbol]] : [];
        arr.push({ ts, price: c.price, quoteVolume: qv });
        if (arr.length > HISTORY_LIMIT) arr.shift();
        next[c.symbol] = arr;
      }
      return next;
    });
  }, [snapshot, tickers]);

  const whale = useMemo(() => computeWhaleIntel(snapshot, history), [snapshot, history]);
  const sentimentIntel = useMemo(
    () => computeSentimentIntel(snapshot, history, prevSentimentScore),
    [snapshot, history, prevSentimentScore],
  );
  const brain = useMemo(
    () => runEliteBrain(snapshot, whale, sentimentIntel),
    [snapshot, whale, sentimentIntel],
  );

  // v3 layers
  const narrative = useMemo(
    () => computeNarrativeIntel(snapshot, history),
    [snapshot, history],
  );
  const ignition = useMemo(
    () => computeMomentumIgnition(snapshot, history),
    [snapshot, history],
  );
  const smartMoney = useMemo(() => computeSmartMoney(whale), [whale]);
  const pressure = useMemo(
    () => computePumpPressure(snapshot, whale, sentimentIntel, narrative, ignition, smartMoney),
    [snapshot, whale, sentimentIntel, narrative, ignition, smartMoney],
  );
  const prevRegimeV3Ref = useRef<RegimeV3 | null>(null);
  const brainV3 = useMemo(
    () =>
      runEliteBrainV3(snapshot, whale, sentimentIntel, narrative, ignition, smartMoney, pressure, {
        previousRegime: prevRegimeV3Ref.current,
      }),
    [snapshot, whale, sentimentIntel, narrative, ignition, smartMoney, pressure],
  );
  useEffect(() => {
    prevRegimeV3Ref.current = brainV3.regime;
  }, [brainV3.regime]);

  const onchain = useMemo(
    () => computeOnChainIntel(snapshot, history, whale, sentimentIntel, narrative, pressure),
    [snapshot, history, whale, sentimentIntel, narrative, pressure],
  );

  const exit = useMemo(
    () => computeExitIntel(snapshot, history, whale, sentimentIntel, narrative, pressure, onchain),
    [snapshot, history, whale, sentimentIntel, narrative, pressure, onchain],
  );

  // Server-computed enhancement layers ride along on the shared feed — shape
  // them to what computeRecommendations expects, defaulting to neutral when
  // the feed hasn't delivered them yet (first paint, or the enhancement layer
  // failed server-side — prices still work either way).
  const derivativesFeed = useMemo(
    () => ({ perAsset: extraFeed?.derivatives ?? {} }),
    [extraFeed],
  );
  const orderbookFeed = useMemo(() => ({ perAsset: extraFeed?.orderbook ?? {} }), [extraFeed]);
  const socialFeed = useMemo(() => ({ perAsset: extraFeed?.social ?? {} }), [extraFeed]);
  const crowdFeed = useMemo(() => ({ perAsset: extraFeed?.crowd ?? {} }), [extraFeed]);
  const stablecoinFeed = useMemo(
    () => ({ netLiquidityScore: extraFeed?.stablecoin?.netLiquidityScore ?? 50 }),
    [extraFeed],
  );
  const confluenceFeed = useMemo(() => ({ perAsset: extraFeed?.confluence ?? {} }), [extraFeed]);
  const optionsFeed = useMemo(() => ({ perCurrency: extraFeed?.options ?? {} }), [extraFeed]);
  const macroFeed = useMemo(() => ({ score: extraFeed?.macro?.score ?? 50 }), [extraFeed]);
  const volatilityFeed = useMemo(() => ({ perAsset: extraFeed?.volatility ?? {} }), [extraFeed]);
  const crossExchangeFeed = useMemo(() => ({ perAsset: extraFeed?.crossExchange ?? {} }), [extraFeed]);
  const communityTrustFeed = useMemo(() => ({ perAsset: extraFeed?.communityTrust ?? {} }), [extraFeed]);
  // computeMomentumIgnition returns a flat `signals` array, not the
  // { perAsset } shape computeRecommendations expects for its ignition
  // weight — reshape it the same way jobs.server.ts does for the
  // server-side call, or the client dashboard's Opportunity Score silently
  // scores ignition as neutral (50) for every coin.
  const ignitionScored = useMemo(
    () => ({ perAsset: Object.fromEntries(ignition.signals.map((s) => [s.symbol, { score: s.score }])) }),
    [ignition],
  );

  const recommendations = useMemo(
    () =>
      computeRecommendations(
        snapshot,
        whale,
        sentimentIntel,
        narrative,
        pressure,
        smartMoney,
        onchain,
        undefined,
        derivativesFeed,
        orderbookFeed,
        socialFeed,
        crowdFeed,
        stablecoinFeed,
        confluenceFeed,
        optionsFeed,
        macroFeed,
        volatilityFeed,
        crossExchangeFeed,
        communityTrustFeed,
        undefined,
        ignitionScored,
      ),
    [
      snapshot,
      whale,
      sentimentIntel,
      narrative,
      pressure,
      smartMoney,
      onchain,
      derivativesFeed,
      orderbookFeed,
      socialFeed,
      crowdFeed,
      stablecoinFeed,
      confluenceFeed,
      optionsFeed,
      macroFeed,
      ignitionScored,
      volatilityFeed,
      crossExchangeFeed,
      communityTrustFeed,
    ],
  );

  // How much to trust the current read: freshness, source quality, how much
  // observed history is behind it, and whether the layers agree with each other.
  const confidence = useMemo(
    () => {
      const series = Object.values(history).map((h) => h.length);
      const avg = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
      return computeConfidence({
        dataAgeMs: lastUpdate ? Date.now() - lastUpdate : 10 * 60_000,
        degradedSource: !isLive,
        layerAgreement: layerAgreement([
          brain.eliteFluxScore,
          sentimentIntel.score,
          whale.score,
          narrative.aggregateStrength,
          ignition.ignitionScore,
          100 - pressure.score,
        ]),
        historyDepth: Math.max(0, Math.min(1, avg / HISTORY_LIMIT)),
      });
    },
    [history, lastUpdate, isLive, brain, sentimentIntel, whale, narrative, ignition, pressure],
  );

  const prevRankingRef = useRef<PrevRanking | null>(null);
  const [recommendationAlerts, setRecommendationAlerts] = useState<RecommendationAlert[]>([]);
  useEffect(() => {
    if (recommendations.opportunities.length === 0) return;
    const { alerts, next } = diffRecommendationAlerts(prevRankingRef.current, recommendations, Date.now());
    prevRankingRef.current = next;
    if (alerts.length > 0) {
      setRecommendationAlerts((prev) => [...alerts, ...prev].slice(0, 40));
    }
  }, [recommendations]);

  // Track previous sentiment score for trend
  useEffect(() => {
    setPrevSentimentScore(sentimentIntel.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(lastUpdate / 8000)]);

  // Detect events on intel transitions
  useEffect(() => {
    const curr = brainToIntelSnapshot(brain, whale, sentimentIntel, narrative, pressure, smartMoney, brainV3);
    const prev = prevIntelRef.current;
    const newEvents = diffEvents(prev, curr, Date.now());
    if (newEvents.length > 0) {
      setEvents((es) => [...newEvents, ...es].slice(0, 60));
    }
    prevIntelRef.current = curr;
  }, [brain, whale, sentimentIntel, narrative, pressure, smartMoney, brainV3]);

  const value = useMemo(
    () => ({
      snapshot,
      isLive,
      lastUpdate,
      error,
      whale,
      sentiment: sentimentIntel,
      brain,
      events,
      history,
      narrative,
      ignition,
      smartMoney,
      pressure,
      brainV3,
      onchain,
      recommendations,
      recommendationAlerts,
      exit,
      confidence,
    }),
    [confidence, snapshot, isLive, lastUpdate, error, whale, sentimentIntel, brain, events, history, narrative, ignition, smartMoney, pressure, brainV3, onchain, recommendations, recommendationAlerts, exit],
  );

  return <LiveMarketContext.Provider value={value}>{children}</LiveMarketContext.Provider>;
}

