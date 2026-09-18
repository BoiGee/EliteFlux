// Server-only exchange adapters. Read-only balance reads + spot market orders.
// Never imported by client code: all access goes through server functions.
import { createHash, createHmac } from "node:crypto";

// Single source of truth for connectable venues — imported by the connect
// schema and every UI touch point instead of each hand-duplicating its own
// list. Kept in sync with the Postgres `exchange_venue` enum by
// __tests__/exchange-venue-sync.test.ts.
export const VENUES = ["binance", "bybit", "okx", "gateio", "kucoin", "mexc"] as const;
export type Venue = (typeof VENUES)[number];

export type Credentials = {
  apiKey: string;
  apiSecret: string;
  passphrase?: string | null;
};

export type Balance = { symbol: string; amount: number };

export type OrderRequest = {
  venue: Venue;
  side: "buy" | "sell";
  /** Base asset, e.g. "SOL". */
  symbol: string;
  stable: string;
  /** For buys: quote notional. For sells: base quantity. */
  quoteUsd?: number;
  baseQty?: number;
  /**
   * Caller-supplied unique ID for this order — pass the same value on every
   * retry of the same intended trade. Every venue here rejects a repeat of
   * an ID it has already seen instead of placing a second order, so if a
   * network timeout hits between the exchange filling an order and this
   * process learning about it, a retry can't double-execute the trade.
   * Alphanumeric only, no separators: OKX's clOrdId is the strictest of the
   * three venues (32 chars, no hyphens), so the caller should already have
   * stripped them before this reaches here.
   */
  clientOrderId: string;
};

export type OrderResult = {
  ok: boolean;
  orderId?: string;
  raw?: unknown;
  error?: string;
  /**
   * The venue rejected this call specifically because clientOrderId was
   * already used — meaning an earlier attempt (this one, or a retry of it)
   * may have actually filled. Not confirmation either way: the caller
   * should record this as unresolved, not as a fresh failure, and a human
   * should check the venue's own order history for the real outcome.
   */
  isDuplicate?: boolean;
};

export const looksLikeDuplicate = (msg: string | undefined) => !!msg && /duplicate/i.test(msg);

const HOSTS: Record<Venue, string> = {
  binance: "https://api.binance.com",
  bybit: "https://api.bybit.com",
  okx: "https://www.okx.com",
  gateio: "https://api.gateio.ws",
  kucoin: "https://api.kucoin.com",
  mexc: "https://api.mexc.com",
};

const hmacHex = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");
const hmacB64 = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64");
const hmacHex512 = (secret: string, payload: string) =>
  createHmac("sha512", secret).update(payload).digest("hex");
const sha512Hex = (payload: string) => createHash("sha512").update(payload).digest("hex");

const DUST = 1e-8;

/* ------------------------------- balances ------------------------------- */

async function binanceBalances(c: Credentials): Promise<Balance[]> {
  const query = `timestamp=${Date.now()}&recvWindow=10000`;
  const url = `${HOSTS.binance}/api/v3/account?${query}&signature=${hmacHex(c.apiSecret, query)}`;
  const res = await fetch(url, { headers: { "X-MBX-APIKEY": c.apiKey } });
  const json = (await res.json()) as {
    balances?: { asset: string; free: string; locked: string }[];
    msg?: string;
  };
  if (!res.ok) throw new Error(json.msg ?? `Account read rejected (${res.status})`);
  return (json.balances ?? [])
    .map((b) => ({ symbol: b.asset.toUpperCase(), amount: Number(b.free) + Number(b.locked) }))
    .filter((b) => Number.isFinite(b.amount) && b.amount > DUST);
}

async function bybitBalances(c: Credentials): Promise<Balance[]> {
  const ts = Date.now().toString();
  const recv = "10000";
  const query = "accountType=UNIFIED";
  const sign = hmacHex(c.apiSecret, ts + c.apiKey + recv + query);
  const res = await fetch(`${HOSTS.bybit}/v5/account/wallet-balance?${query}`, {
    headers: {
      "X-BAPI-API-KEY": c.apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recv,
      "X-BAPI-SIGN": sign,
    },
  });
  const json = (await res.json()) as {
    retCode?: number;
    retMsg?: string;
    result?: { list?: { coin?: { coin: string; walletBalance: string }[] }[] };
  };
  if (json.retCode !== 0) throw new Error(json.retMsg ?? `Account read rejected (${res.status})`);
  const coins = json.result?.list?.[0]?.coin ?? [];
  return coins
    .map((x) => ({ symbol: x.coin.toUpperCase(), amount: Number(x.walletBalance) }))
    .filter((b) => Number.isFinite(b.amount) && b.amount > DUST);
}

async function okxBalances(c: Credentials): Promise<Balance[]> {
  const ts = new Date().toISOString();
  const path = "/api/v5/account/balance";
  const res = await fetch(`${HOSTS.okx}${path}`, {
    headers: {
      "OK-ACCESS-KEY": c.apiKey,
      "OK-ACCESS-SIGN": hmacB64(c.apiSecret, `${ts}GET${path}`),
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": c.passphrase ?? "",
      "Content-Type": "application/json",
    },
  });
  const json = (await res.json()) as {
    code?: string;
    msg?: string;
    data?: { details?: { ccy: string; eq: string }[] }[];
  };
  if (json.code !== "0") throw new Error(json.msg || `Account read rejected (${res.status})`);
  return (json.data?.[0]?.details ?? [])
    .map((d) => ({ symbol: d.ccy.toUpperCase(), amount: Number(d.eq) }))
    .filter((b) => Number.isFinite(b.amount) && b.amount > DUST);
}

async function gateioBalances(c: Credentials): Promise<Balance[]> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const path = "/api/v4/spot/accounts";
  const signString = `${method}\n${path}\n\n${sha512Hex("")}\n${ts}`;
  const res = await fetch(`${HOSTS.gateio}${path}`, {
    headers: {
      KEY: c.apiKey,
      Timestamp: ts,
      SIGN: hmacHex512(c.apiSecret, signString),
    },
  });
  const json = (await res.json()) as { currency?: string; available?: string; locked?: string; label?: string; message?: string }[] | { label?: string; message?: string };
  if (!res.ok || !Array.isArray(json)) {
    const err = json as { label?: string; message?: string };
    throw new Error(err.message ?? err.label ?? `Account read rejected (${res.status})`);
  }
  return json
    .map((b) => ({ symbol: (b.currency ?? "").toUpperCase(), amount: Number(b.available ?? 0) + Number(b.locked ?? 0) }))
    .filter((b) => b.symbol && Number.isFinite(b.amount) && b.amount > DUST);
}

async function kucoinBalances(c: Credentials): Promise<Balance[]> {
  const ts = Date.now().toString();
  const method = "GET";
  const path = "/api/v1/accounts";
  const prehash = `${ts}${method}${path}`;
  // API-Key-V2: the passphrase itself is HMAC-signed (not sent plain) —
  // matches the "KC-API-KEY-VERSION: 2" requirement KuCoin's own docs call out.
  const res = await fetch(`${HOSTS.kucoin}${path}`, {
    headers: {
      "KC-API-KEY": c.apiKey,
      "KC-API-SIGN": hmacB64(c.apiSecret, prehash),
      "KC-API-TIMESTAMP": ts,
      "KC-API-PASSPHRASE": hmacB64(c.apiSecret, c.passphrase ?? ""),
      "KC-API-KEY-VERSION": "2",
    },
  });
  const json = (await res.json()) as { code?: string; msg?: string; data?: { currency: string; balance: string; holds: string; type: string }[] };
  if (json.code !== "200000") throw new Error(json.msg || `Account read rejected (${res.status})`);
  return (json.data ?? [])
    .filter((d) => d.type === "trade")
    .map((d) => ({ symbol: d.currency.toUpperCase(), amount: Number(d.balance) }))
    .filter((b) => Number.isFinite(b.amount) && b.amount > DUST);
}

async function mexcBalances(c: Credentials): Promise<Balance[]> {
  const query = `timestamp=${Date.now()}&recvWindow=10000`;
  const url = `${HOSTS.mexc}/api/v3/account?${query}&signature=${hmacHex(c.apiSecret, query)}`;
  const res = await fetch(url, { headers: { "X-MEXC-APIKEY": c.apiKey } });
  const json = (await res.json()) as { balances?: { asset: string; free: string; locked: string }[]; msg?: string };
  if (!res.ok) throw new Error(json.msg ?? `Account read rejected (${res.status})`);
  return (json.balances ?? [])
    .map((b) => ({ symbol: b.asset.toUpperCase(), amount: Number(b.free) + Number(b.locked) }))
    .filter((b) => Number.isFinite(b.amount) && b.amount > DUST);
}

const BALANCE_FNS: Record<Venue, (c: Credentials) => Promise<Balance[]>> = {
  binance: binanceBalances,
  bybit: bybitBalances,
  okx: okxBalances,
  gateio: gateioBalances,
  kucoin: kucoinBalances,
  mexc: mexcBalances,
};

export async function fetchBalances(venue: Venue, c: Credentials): Promise<Balance[]> {
  return BALANCE_FNS[venue](c);
}

/* -------------------------------- orders -------------------------------- */

async function binanceOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  const params = new URLSearchParams({
    symbol: `${r.symbol}${r.stable}`,
    side: r.side.toUpperCase(),
    type: "MARKET",
    newClientOrderId: r.clientOrderId,
    timestamp: Date.now().toString(),
    recvWindow: "10000",
  });
  if (r.side === "buy") params.set("quoteOrderQty", String(r.quoteUsd ?? 0));
  else params.set("quantity", String(r.baseQty ?? 0));
  const query = params.toString();
  const res = await fetch(
    `${HOSTS.binance}/api/v3/order?${query}&signature=${hmacHex(c.apiSecret, query)}`,
    { method: "POST", headers: { "X-MBX-APIKEY": c.apiKey } },
  );
  const json = (await res.json()) as { orderId?: number; msg?: string; code?: number };
  if (!res.ok) {
    // Binance: -2010 "Duplicate order sent" is the documented code for a
    // reused newClientOrderId, but match on message too in case that drifts.
    const isDuplicate = json.code === -2010 || looksLikeDuplicate(json.msg);
    return { ok: false, error: json.msg ?? `order rejected (${res.status})`, raw: json, isDuplicate };
  }
  return { ok: true, orderId: String(json.orderId ?? ""), raw: json };
}

async function bybitOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  const ts = Date.now().toString();
  const recv = "10000";
  const body = JSON.stringify({
    category: "spot",
    symbol: `${r.symbol}${r.stable}`,
    side: r.side === "buy" ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(r.side === "buy" ? (r.quoteUsd ?? 0) : (r.baseQty ?? 0)),
    marketUnit: r.side === "buy" ? "quoteCoin" : "baseCoin",
    orderLinkId: r.clientOrderId,
  });
  const res = await fetch(`${HOSTS.bybit}/v5/order/create`, {
    method: "POST",
    headers: {
      "X-BAPI-API-KEY": c.apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recv,
      "X-BAPI-SIGN": hmacHex(c.apiSecret, ts + c.apiKey + recv + body),
      "Content-Type": "application/json",
    },
    body,
  });
  const json = (await res.json()) as { retCode?: number; retMsg?: string; result?: { orderId?: string } };
  if (json.retCode !== 0) {
    // 110072 "OrderLinkedID is duplicate" (v5 unified create-order) and
    // 30001 "order_link_id is repeated" — both documented Bybit duplicate-
    // orderLinkId codes (confirmed against ccxt's error-code map); unlike
    // Binance/OKX below, only a text-match fallback existed here before.
    const isDuplicate = json.retCode === 110072 || json.retCode === 30001 || looksLikeDuplicate(json.retMsg);
    return { ok: false, error: json.retMsg ?? "order rejected", raw: json, isDuplicate };
  }
  return { ok: true, orderId: json.result?.orderId ?? "", raw: json };
}

async function okxOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  const ts = new Date().toISOString();
  const path = "/api/v5/trade/order";
  const body = JSON.stringify({
    instId: `${r.symbol}-${r.stable}`,
    tdMode: "cash",
    side: r.side,
    ordType: "market",
    sz: String(r.side === "buy" ? (r.quoteUsd ?? 0) : (r.baseQty ?? 0)),
    tgtCcy: r.side === "buy" ? "quote_ccy" : "base_ccy",
    clOrdId: r.clientOrderId,
  });
  const res = await fetch(`${HOSTS.okx}${path}`, {
    method: "POST",
    headers: {
      "OK-ACCESS-KEY": c.apiKey,
      "OK-ACCESS-SIGN": hmacB64(c.apiSecret, `${ts}POST${path}${body}`),
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": c.passphrase ?? "",
      "Content-Type": "application/json",
    },
    body,
  });
  const json = (await res.json()) as { code?: string; msg?: string; data?: { ordId?: string; sMsg?: string; sCode?: string }[] };
  if (json.code !== "0") {
    const sMsg = json.data?.[0]?.sMsg;
    // OKX: sCode 51023 is "Order already exists" for a reused clOrdId.
    const isDuplicate = json.data?.[0]?.sCode === "51023" || looksLikeDuplicate(sMsg) || looksLikeDuplicate(json.msg);
    return { ok: false, error: sMsg || json.msg || "order rejected", raw: json, isDuplicate };
  }
  return { ok: true, orderId: json.data?.[0]?.ordId ?? "", raw: json };
}

async function mexcOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  const params = new URLSearchParams({
    symbol: `${r.symbol}${r.stable}`,
    side: r.side.toUpperCase(),
    type: "MARKET",
    newClientOrderId: r.clientOrderId,
    timestamp: Date.now().toString(),
    recvWindow: "10000",
  });
  if (r.side === "buy") params.set("quoteOrderQty", String(r.quoteUsd ?? 0));
  else params.set("quantity", String(r.baseQty ?? 0));
  const query = params.toString();
  const res = await fetch(`${HOSTS.mexc}/api/v3/order?${query}&signature=${hmacHex(c.apiSecret, query)}`, {
    method: "POST",
    headers: { "X-MEXC-APIKEY": c.apiKey },
  });
  const json = (await res.json()) as { orderId?: string | number; msg?: string; code?: number };
  if (!res.ok) {
    // No independently-confirmed MEXC duplicate-clientOrderId error code —
    // rely on the generic text match only, same safety net the other three
    // venues fall back on.
    return { ok: false, error: json.msg ?? `order rejected (${res.status})`, raw: json, isDuplicate: looksLikeDuplicate(json.msg) };
  }
  return { ok: true, orderId: String(json.orderId ?? ""), raw: json };
}

const ORDER_FNS: Partial<Record<Venue, (c: Credentials, r: OrderRequest) => Promise<OrderResult>>> = {
  binance: binanceOrder,
  bybit: bybitOrder,
  okx: okxOrder,
  mexc: mexcOrder,
};

export async function placeSpotOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  try {
    const fn = ORDER_FNS[r.venue];
    if (!fn) return { ok: false, error: `${r.venue} is read-only in EliteFlux; connect Bybit, OKX or MEXC for Autopilot trading.` };
    return await fn(c, r);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "order failed" };
  }
}
