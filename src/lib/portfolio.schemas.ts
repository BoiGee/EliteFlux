import { z } from "zod";
import { GUARDRAIL_BOUNDS } from "./autonomy";

const b = GUARDRAIL_BOUNDS;

export const connectExchangeSchema = z.object({
  venue: z.enum(["binance", "bybit", "okx"]),
  label: z.string().trim().max(40).optional(),
  permission: z.enum(["read_only", "read_trade"]).default("read_only"),
  apiKey: z.string().trim().min(8).max(256),
  apiSecret: z.string().trim().min(8).max(256),
  passphrase: z.string().trim().max(128).optional(),
});

export const addWalletSchema = z.object({
  chain: z.enum(["evm", "solana"]),
  address: z.string().trim().min(26).max(64),
  label: z.string().trim().max(40).optional(),
});

export const idSchema = z.object({ id: z.string().uuid() });

const symbolList = z
  .array(z.string().trim().toUpperCase().min(1).max(12))
  .max(50)
  .default([]);

export const settingsSchema = z.object({
  level: z.enum(["observe", "advise", "approve", "autopilot"]).optional(),
  paper_mode: z.boolean().optional(),
  max_trade_pct: z.number().min(b.max_trade_pct.min).max(b.max_trade_pct.max).optional(),
  max_trade_usd: z.number().min(b.max_trade_usd.min).max(b.max_trade_usd.max).optional(),
  max_trades_per_day: z.number().int().min(b.max_trades_per_day.min).max(b.max_trades_per_day.max).optional(),
  max_daily_usd: z.number().min(b.max_daily_usd.min).max(b.max_daily_usd.max).optional(),
  min_conviction: z.number().int().min(b.min_conviction.min).max(b.min_conviction.max).optional(),
  cooldown_hours: z.number().int().min(b.cooldown_hours.min).max(b.cooldown_hours.max).optional(),
  drawdown_breaker_pct: z
    .number()
    .min(b.drawdown_breaker_pct.min)
    .max(b.drawdown_breaker_pct.max)
    .optional(),
  allowed_symbols: symbolList.optional(),
  blocked_symbols: symbolList.optional(),
  stable_symbol: z.enum(["USDT", "USDC"]).optional(),
});

export const armSchema = z.object({
  phrase: z.string(),
  accept_disclosure: z.boolean(),
});

export const decideSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
});

export const keyPolicySchema = z.object({ readonlyOnly: z.boolean() });

/**
 * Turn a raw exchange rejection into a next step a beginner can actually take.
 * Returns null when we have no better wording than the original message.
 */
export function friendlyConnectError(message: string): string | null {
  const m = (message || "").toLowerCase();
  if (/api-key, ip, or permissions/.test(m))
    return "Your exchange rejected this for one of three reasons: the key/secret is wrong, an IP restriction is on, or reading isn't enabled. Since we run on shared cloud infrastructure with no fixed IP, first set the key's IP access to Unrestricted (an IP whitelist will always fail here) — then double-check Read is enabled and the key/secret were copied correctly.";
  if (/signature|invalid api|api-key format|apikey|invalid key|unauthorized|401/.test(m))
    return "That key or secret was not accepted. It is almost always a missing character or a stray space — copy both again from your exchange and paste them without editing.";
  if (/ip|whitelist|restricted location|region/.test(m))
    return "Your key is locked to specific computers (an IP whitelist), so our server cannot use it. Remove that restriction on your exchange and try again.";
  if (/permission|forbidden|not allowed|403|scope/.test(m))
    return "This key does not have reading switched on. Go back to your exchange, create a new key with Read enabled, and leave withdrawals off.";
  if (/timestamp|recv ?window|time|clock/.test(m))
    return "Your exchange rejected the request timing. Wait a few seconds and press Connect again.";
  if (/rate limit|too many|429/.test(m))
    return "Your exchange is asking us to slow down. Wait a minute and try once more.";
  if (/network|fetch|timeout|econn/.test(m))
    return "We could not reach your exchange just now. Check your connection and try again in a moment.";
  return null;
}

/** Same idea as friendlyConnectError, for wallet-address insert failures. */
export function friendlyWalletError(message: string): string | null {
  const m = (message || "").toLowerCase();
  if (/duplicate key|unique constraint/.test(m)) return "You've already added this wallet.";
  return null;
}
