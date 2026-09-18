// Server-only portfolio sync: decrypts exchange credentials, reads balances
// from exchanges and public wallet addresses, prices them, and stores the
// merged snapshot.
import type { SupabaseClient } from "@supabase/supabase-js";
import { open } from "./vault.server";
import { fetchBalances, type Venue } from "./exchanges.server";
import { fetchWalletBalances, type Chain } from "./wallets.server";
import { isStable, type PortfolioView } from "./autopilot-engine";
import { fetchOkxPrices } from "./cross-exchange-intel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const BINANCE_REST = "https://api.binance.com/api/v3";
const BYBIT_REST = "https://api.bybit.com/v5";

// No fetch() here previously had a timeout — a stalled response could hang
// the whole portfolio sync indefinitely.
function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Second exchange, public ticker read — Bybit's spot symbol ("BTCUSDT") needs no reshaping to match `${symbol}USDT` keys. */
async function fetchBybitPrices(): Promise<Map<string, number> | null> {
  try {
    const res = await timedFetch(`${BYBIT_REST}/market/tickers?category=spot`, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { list?: { symbol: string; lastPrice: string }[] } };
    const map = new Map<string, number>();
    for (const t of json.result?.list ?? []) {
      const price = Number(t.lastPrice);
      if (Number.isFinite(price) && price > 0) map.set(t.symbol, price);
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * USD prices for a set of tickers. Stables are pinned to 1. Binance returns
 * 403 (blocked) on every request from this Worker's egress — confirmed live
 * in production — so it's kept only as a last-resort tail here, tried after
 * OKX and Bybit's public ticker reads both come up short.
 */
export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  for (const s of wanted) if (isStable(s)) prices[s] = 1;

  let needed = wanted.filter((s) => !isStable(s));
  if (needed.length === 0) return prices;

  const okx = await fetchOkxPrices();
  if (okx) {
    for (const s of needed) {
      const p = okx.get(`${s}-USDT`);
      if (p) prices[s] = p;
    }
    needed = needed.filter((s) => !(s in prices));
  }
  if (needed.length === 0) return prices;

  const bybit = await fetchBybitPrices();
  if (bybit) {
    for (const s of needed) {
      const p = bybit.get(`${s}USDT`);
      if (p) prices[s] = p;
    }
    needed = needed.filter((s) => !(s in prices));
  }
  if (needed.length === 0) return prices;

  const pairs = needed.map((s) => `${s}USDT`);
  try {
    const url = `${BINANCE_REST}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;
    const res = await timedFetch(url);
    if (res.ok) {
      const arr = (await res.json()) as { symbol: string; price: string }[];
      for (const t of arr) {
        const base = t.symbol.replace(/USDT$/, "");
        const p = Number(t.price);
        if (Number.isFinite(p)) prices[base] = p;
      }
      return prices;
    }
    // Binance rejects the WHOLE batch if even one pair is invalid/delisted —
    // fall back to per-symbol requests so one bad pair doesn't zero out
    // pricing for every other asset in this sync.
    await fetchPricesIndividually(pairs, prices);
  } catch {
    await fetchPricesIndividually(pairs, prices).catch(() => {
      /* unpriced assets simply show no value */
    });
  }
  return prices;
}

async function fetchPricesIndividually(pairs: string[], prices: Record<string, number>): Promise<void> {
  const results = await Promise.allSettled(
    pairs.map(async (pair) => {
      const res = await timedFetch(`${BINANCE_REST}/ticker/price?symbol=${pair}`);
      if (!res.ok) throw new Error(`${pair} unavailable`);
      const t = (await res.json()) as { symbol: string; price: string };
      return { base: t.symbol.replace(/USDT$/, ""), price: Number(t.price) };
    }),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && Number.isFinite(r.value.price)) prices[r.value.base] = r.value.price;
  }
}

type Row = {
  user_id: string;
  source: "exchange" | "wallet";
  source_id: string;
  source_label: string;
  symbol: string;
  amount: number;
  price: number | null;
  usd_value: number | null;
  weight: number | null;
  synced_at: string;
};

export type SyncReport = {
  holdings: number;
  totalUsd: number;
  errors: { source: string; message: string }[];
};

/** Re-read every connected source for one user and rewrite their holdings. */
export async function syncPortfolio(db: DB, userId: string): Promise<SyncReport> {
  const errors: SyncReport["errors"] = [];
  const raw: { source: "exchange" | "wallet"; id: string; label: string; symbol: string; amount: number }[] = [];

  const { data: connections } = await db
    .from("exchange_connections")
    .select("id,venue,label,api_key_ciphertext,api_secret_ciphertext,passphrase_ciphertext")
    .eq("user_id", userId);

  for (const c of (connections ?? []) as {
    id: string;
    venue: Venue;
    label: string | null;
    api_key_ciphertext: string;
    api_secret_ciphertext: string;
    passphrase_ciphertext: string | null;
  }[]) {
    const label = c.label || c.venue;
    try {
      const balances = await fetchBalances(c.venue, {
        apiKey: await open(c.api_key_ciphertext),
        apiSecret: await open(c.api_secret_ciphertext),
        passphrase: c.passphrase_ciphertext ? await open(c.passphrase_ciphertext) : null,
      });
      for (const b of balances) {
        raw.push({ source: "exchange", id: c.id, label, symbol: b.symbol, amount: b.amount });
      }
      await db
        .from("exchange_connections")
        .update({ status: "connected", last_error: null, last_synced_at: new Date().toISOString() })
        .eq("id", c.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "sync failed";
      errors.push({ source: label, message });
      await db.from("exchange_connections").update({ status: "error", last_error: message }).eq("id", c.id);
    }
  }

  const { data: wallets } = await db
    .from("wallet_addresses")
    .select("id,chain,address,label")
    .eq("user_id", userId);

  for (const w of (wallets ?? []) as { id: string; chain: Chain; address: string; label: string | null }[]) {
    const label = w.label || `${w.chain}:${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
    try {
      const { balances, unrecognizedTokenCount, coverageNote } = await fetchWalletBalances(w.chain, w.address);
      for (const b of balances) {
        raw.push({ source: "wallet", id: w.id, label, symbol: b.symbol, amount: b.amount });
      }
      // Not an error — status stays "connected" — but this note is worth
      // surfacing durably (not just in the one-time sync toast) so a user
      // knows their tracked total may be understated, and why.
      const note =
        unrecognizedTokenCount > 0
          ? `+${unrecognizedTokenCount} other token${unrecognizedTokenCount === 1 ? "" : "s"} held but not tracked`
          : coverageNote;
      await db
        .from("wallet_addresses")
        .update({ status: "connected", last_error: note, last_synced_at: new Date().toISOString() })
        .eq("id", w.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "sync failed";
      errors.push({ source: label, message });
      await db.from("wallet_addresses").update({ status: "error", last_error: message }).eq("id", w.id);
    }
  }

  const prices = await fetchPrices(raw.map((r) => r.symbol));
  const now = new Date().toISOString();
  const priced = raw.map((r) => {
    const price = prices[r.symbol.toUpperCase()] ?? null;
    return { ...r, price, usd: price !== null ? price * r.amount : null };
  });
  const totalUsd = priced.reduce((s, r) => s + (r.usd ?? 0), 0);

  const rows: Row[] = priced.map((r) => ({
    user_id: userId,
    source: r.source,
    source_id: r.id,
    source_label: r.label,
    symbol: r.symbol,
    amount: r.amount,
    price: r.price,
    usd_value: r.usd,
    weight: totalUsd > 0 && r.usd !== null ? (r.usd / totalUsd) * 100 : null,
    synced_at: now,
  }));

  await db.from("portfolio_holdings").delete().eq("user_id", userId);
  if (rows.length) {
    const { error } = await db.from("portfolio_holdings").insert(rows as never);
    if (error) errors.push({ source: "storage", message: error.message });
  }

  return { holdings: rows.length, totalUsd, errors };
}

/** Collapse stored holdings into the shape the autopilot engine reads. */
export async function loadPortfolioView(db: DB, userId: string): Promise<PortfolioView> {
  const { data } = await db
    .from("portfolio_holdings")
    .select("symbol,amount,usd_value")
    .eq("user_id", userId);

  const bySymbol = new Map<string, { amount: number; usdValue: number }>();
  for (const h of (data ?? []) as { symbol: string; amount: number; usd_value: number | null }[]) {
    const key = h.symbol.toUpperCase();
    const cur = bySymbol.get(key) ?? { amount: 0, usdValue: 0 };
    cur.amount += Number(h.amount) || 0;
    cur.usdValue += Number(h.usd_value) || 0;
    bySymbol.set(key, cur);
  }

  const totalUsd = [...bySymbol.values()].reduce((s, v) => s + v.usdValue, 0);
  const stableUsd = [...bySymbol.entries()]
    .filter(([s]) => isStable(s))
    .reduce((s, [, v]) => s + v.usdValue, 0);

  return {
    totalUsd,
    stableUsd,
    positions: [...bySymbol.entries()]
      .filter(([s]) => !isStable(s))
      .map(([symbol, v]) => ({
        symbol,
        amount: v.amount,
        usdValue: v.usdValue,
        weight: totalUsd > 0 ? (v.usdValue / totalUsd) * 100 : 0,
      }))
      .sort((a, b) => b.usdValue - a.usdValue),
  };
}
