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
  max_trade_pct: { min: 0.5, max: 25 },
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
