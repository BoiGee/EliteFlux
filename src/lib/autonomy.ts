// Client-safe autonomy model: levels, guardrail shape and defaults.
// Enforcement always happens server-side; this file is shared vocabulary.

export type AutonomyLevel = "observe" | "advise" | "approve" | "autopilot";

export const AUTONOMY_LEVELS: {
  key: AutonomyLevel;
  index: number;
  name: string;
  blurb: string;
}[] = [
  {
    key: "observe",
    index: 0,
    name: "Observe",
    blurb: "Answers your questions only. Never suggests an action.",
  },
  {
    key: "advise",
    index: 1,
    name: "Advise",
    blurb: "Proposes concrete moves in chat. You act wherever you trade.",
  },
  {
    key: "approve",
    index: 2,
    name: "Approve",
    blurb: "Queues actions in your inbox. Nothing happens until you approve it.",
  },
  {
    key: "autopilot",
    index: 3,
    name: "Autopilot",
    blurb: "Acts inside your guardrails, then reports exactly what it did.",
  },
];

export const levelIndex = (l: AutonomyLevel) =>
  AUTONOMY_LEVELS.find((x) => x.key === l)?.index ?? 0;

export type Guardrails = {
  max_trade_pct: number;
  max_trade_usd: number;
  max_trades_per_day: number;
  max_daily_usd: number;
  min_conviction: number;
  cooldown_hours: number;
  drawdown_breaker_pct: number;
  allowed_symbols: string[];
  blocked_symbols: string[];
  stable_symbol: string;
};

export type AutopilotSettings = Guardrails & {
  user_id: string;
  level: AutonomyLevel;
  paper_mode: boolean;
  armed: boolean;
  kill_switch: boolean;
  disclosure_accepted_at: string | null;
  armed_at: string | null;
  disarmed_reason: string | null;
  /** Portfolio high-water mark, in USD — the baseline the drawdown breaker measures from. Null until the first run establishes one. */
  peak_portfolio_usd: number | null;
};

export const DEFAULT_SETTINGS: Guardrails & {
  level: AutonomyLevel;
  paper_mode: boolean;
  armed: boolean;
  kill_switch: boolean;
} = {
  level: "advise",
  paper_mode: true,
  armed: false,
  kill_switch: false,
  max_trade_pct: 5,
  max_trade_usd: 250,
  max_trades_per_day: 3,
  max_daily_usd: 750,
  min_conviction: 70,
  cooldown_hours: 12,
  drawdown_breaker_pct: 15,
  allowed_symbols: [],
  blocked_symbols: [],
  stable_symbol: "USDT",
};

export const GUARDRAIL_BOUNDS = {
  max_trade_pct: { min: 0.5, max: 40 },
  max_trade_usd: { min: 10, max: 25000 },
  max_trades_per_day: { min: 1, max: 20 },
  max_daily_usd: { min: 10, max: 100000 },
  min_conviction: { min: 50, max: 95 },
  cooldown_hours: { min: 1, max: 168 },
  drawdown_breaker_pct: { min: 3, max: 50 },
} as const;

export const ARM_PHRASE = "ARM AUTOPILOT";

export type ActionKind = "buy" | "trim" | "exit" | "hold";
export type ActionState =
  | "proposed"
  | "approved"
  | "rejected"
  | "executing"
  | "executed"
  | "failed"
  | "expired"
  | "blocked";

export type AutopilotAction = {
  id: string;
  kind: ActionKind;
  symbol: string;
  size_pct: number | null;
  notional_usd: number | null;
  reference_price: number | null;
  conviction: number | null;
  rationale: string;
  state: ActionState;
  blocked_reason: string | null;
  paper: boolean;
  venue: string | null;
  order_result: unknown;
  created_at: string;
  executed_at: string | null;
  expires_at: string | null;
};

export type Holding = {
  id: string;
  source: "exchange" | "wallet" | "manual";
  source_label: string | null;
  symbol: string;
  amount: number;
  price: number | null;
  usd_value: number | null;
  weight: number | null;
  synced_at: string;
};

export const RISK_DISCLOSURE = [
  "EliteFlux is an intelligence platform, not a licensed financial adviser. Nothing here is investment advice.",
  "Autopilot places real spot orders on your connected exchange when live mode is on. Orders can lose money.",
  "Signals can be wrong, markets gap, and exchanges can reject or delay orders.",
  "EliteFlux never holds your funds and never accepts an API key with withdrawal permission.",
  "You can disarm autopilot or hit the kill switch at any time; open orders already sent are your responsibility.",
];

// ---------------------------------------------------------------------------
// Early/unlisted token discovery — a separate, stricter autonomy model from
// Autopilot's above. Discovered tokens trade on DEXs, not the centralized
// exchanges Autopilot connects to, and most new/unlisted tokens are scams or
// rug pulls, not just a riskier version of the coins Autopilot already
// trades. There is no live-execution path for this asset class today —
// every position here is a paper trade, enforced at the database level
// (autopilot_actions' aa_discovery_paper_only CHECK constraint), not just by
// this settings object.
// ---------------------------------------------------------------------------

/** Networks covered on day one — single source of truth; discovery-providers.server.ts imports this rather than redefining it. */
export const DISCOVERY_NETWORKS = ["eth", "bsc", "base", "arbitrum", "solana"] as const;

export type DiscoveryGuardrails = {
  min_safety_score: number;
  max_position_usd: number;
  total_allocation_budget_usd: number;
  max_open_positions: number;
  allowed_networks: string[];
};

export type DiscoverySettings = DiscoveryGuardrails & {
  user_id: string;
  opted_in: boolean;
  armed: boolean;
  kill_switch: boolean;
  disclosure_accepted_at: string | null;
};

export const DISCOVERY_DEFAULT_SETTINGS: DiscoveryGuardrails & {
  opted_in: boolean;
  armed: boolean;
  kill_switch: boolean;
} = {
  opted_in: false,
  armed: false,
  kill_switch: false,
  min_safety_score: 80,
  max_position_usd: 25,
  total_allocation_budget_usd: 100,
  max_open_positions: 3,
  allowed_networks: [],
};

// No max_position_pct here, unlike Autopilot's Guardrails — these are paper
// positions, so sizing relative to a real balance isn't a meaningful bound
// the way it is for live Autopilot. A flat USD ceiling plus a cumulative
// allocation budget is the right primitive instead.
export const DISCOVERY_GUARDRAIL_BOUNDS = {
  min_safety_score: { min: 60, max: 95 },
  max_position_usd: { min: 5, max: 100 },
  total_allocation_budget_usd: { min: 25, max: 1000 },
  max_open_positions: { min: 1, max: 10 },
} as const;

export const DISCOVERY_NETWORK_LABEL: Record<string, string> = {
  eth: "Ethereum",
  bsc: "BNB Chain",
  base: "Base",
  arbitrum: "Arbitrum",
  solana: "Solana",
};

export const DISCOVERY_RISK_DISCLOSURE = [
  "This is a separate, higher-risk feature from Autopilot. Most brand-new, not-yet-listed tokens are scams, rug pulls, or thin, manipulable markets.",
  "Paper-mode only — no real order is ever placed. EliteFlux has no on-chain wallet-signing infrastructure, so nothing here can touch real funds, by construction, not just by a setting you could turn off.",
  "The 0-100 safety score is a screen, not a guarantee. It cannot see wash-distributed holdings (many wallets, one real controller) or a tax/limit that only activates after launch.",
  "A token passing every check today can still fail tomorrow — re-checked every cycle, but a result can flip between checks.",
  "You can withdraw consent or hit the kill switch at any time; positions already recorded stay in your history either way.",
];
