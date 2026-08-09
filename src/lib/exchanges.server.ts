// Server-only exchange adapters. Read-only balance reads + spot market orders.
// Never imported by client code: all access goes through server functions.
import { createHmac } from "node:crypto";

export type Venue = "binance" | "bybit" | "okx";

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
};

export type OrderResult = {
  ok: boolean;
  orderId?: string;
  raw?: unknown;
  error?: string;
};

const HOSTS: Record<Venue, string> = {
  binance: "https://api.binance.com",
  bybit: "https://api.bybit.com",
  okx: "https://www.okx.com",
};

const hmacHex = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");
const hmacB64 = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("base64");

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

export async function fetchBalances(venue: Venue, c: Credentials): Promise<Balance[]> {
  if (venue === "binance") return binanceBalances(c);
  if (venue === "bybit") return bybitBalances(c);
  return okxBalances(c);
}

/* -------------------------------- orders -------------------------------- */

async function binanceOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  const params = new URLSearchParams({
    symbol: `${r.symbol}${r.stable}`,
    side: r.side.toUpperCase(),
    type: "MARKET",
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
  const json = (await res.json()) as { orderId?: number; msg?: string };
  if (!res.ok) return { ok: false, error: json.msg ?? `order rejected (${res.status})`, raw: json };
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
  if (json.retCode !== 0) return { ok: false, error: json.retMsg ?? "order rejected", raw: json };
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
  const json = (await res.json()) as { code?: string; msg?: string; data?: { ordId?: string; sMsg?: string }[] };
  if (json.code !== "0") {
    return { ok: false, error: json.data?.[0]?.sMsg || json.msg || "order rejected", raw: json };
  }
  return { ok: true, orderId: json.data?.[0]?.ordId ?? "", raw: json };
}

export async function placeSpotOrder(c: Credentials, r: OrderRequest): Promise<OrderResult> {
  try {
    if (r.venue === "binance") return await binanceOrder(c, r);
    if (r.venue === "bybit") return await bybitOrder(c, r);
    return await okxOrder(c, r);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "order failed" };
  }
}
