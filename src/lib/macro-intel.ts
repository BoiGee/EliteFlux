// ============================================================
// Macro Correlation Layer
// ------------------------------------------------------------
// Almost nothing in retail crypto tooling tracks this, but it's
// what actually moves the market on macro-driven days: how tightly
// BTC is currently trading with the dollar (DXY), equities (SPX)
// and gold. Real daily closes from Yahoo Finance (macro) and
// CoinGecko (BTC) — no keys, no proxies.
// ============================================================

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const MACRO_SYMBOLS = {
  dxy: "DX-Y.NYB",
  spx: "%5EGSPC",
  gold: "GC=F",
} as const;
type MacroKey = keyof typeof MACRO_SYMBOLS;

interface DailySeries {
  dates: string[]; // ISO yyyy-mm-dd
  closes: number[];
}

// No timeout here previously could hang the whole evaluate-alerts cycle
// indefinitely on a single stalled response.
function timedFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  return fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchYahooDaily(symbol: string): Promise<DailySeries | null> {
  try {
    const res = await timedFetch(`${YAHOO}/${symbol}?range=3mo&interval=1d`, {
      "User-Agent": "Mozilla/5.0 (EliteFlux/1.0)",
      Accept: "application/json",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
    };
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes || timestamps.length !== closes.length) return null;
    const dates: string[] = [];
    const vals: number[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (typeof c !== "number" || !Number.isFinite(c)) continue;
      dates.push(new Date(timestamps[i]! * 1000).toISOString().slice(0, 10));
      vals.push(c);
    }
    return vals.length >= 10 ? { dates, closes: vals } : null;
  } catch {
    return null;
  }
}

async function fetchBtcDaily(days = 90): Promise<DailySeries | null> {
  try {
    const res = await timedFetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`, {
      "User-Agent": "EliteFlux/1.0",
      Accept: "application/json",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { prices?: [number, number][] };
    if (!json.prices?.length) return null;
    const dates = json.prices.map(([ts]) => new Date(ts).toISOString().slice(0, 10));
    const closes = json.prices.map(([, p]) => p);
    return { dates, closes };
  } catch {
    return null;
  }
}

/** Daily % returns, date-aligned to `series`. */
function dailyReturns(series: DailySeries): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < series.closes.length; i++) {
    const prev = series.closes[i - 1]!;
    const curr = series.closes[i]!;
    if (prev > 0) out.set(series.dates[i]!, ((curr - prev) / prev) * 100);
  }
  return out;
}

/** Pearson correlation of two same-length return series, joined by date. */
function correlate(a: Map<string, number>, b: Map<string, number>): { r: number; n: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, x] of a) {
    const y = b.get(date);
    if (y !== undefined) {
      xs.push(x);
      ys.push(y);
    }
  }
  const n = xs.length;
  if (n < 10) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX <= 0 || varY <= 0) return null;
  return { r: cov / Math.sqrt(varX * varY), n };
}

export interface MacroCorrelation {
  correlation30d: number | null; // -1..1
  sampleSize: number;
  return30dPct: number | null; // the macro asset's own 30d move
}

export interface MacroIntel {
  dxy: MacroCorrelation;
  spx: MacroCorrelation;
  gold: MacroCorrelation;
  regime: "risk-on coupling" | "risk-off coupling" | "dollar headwind" | "decoupled" | "insufficient_data";
  /** 0..100, market-wide. 50 = neutral. Reflects whether the macro backdrop is currently a tailwind or headwind. */
  score: number;
  generatedAt: number;
}

const NEUTRAL_CORR: MacroCorrelation = { correlation30d: null, sampleSize: 0, return30dPct: null };
const NEUTRAL: MacroIntel = { dxy: NEUTRAL_CORR, spx: NEUTRAL_CORR, gold: NEUTRAL_CORR, regime: "insufficient_data", score: 50, generatedAt: Date.now() };

function macroLeg(macro: DailySeries | null, btcReturns: Map<string, number>): MacroCorrelation {
  if (!macro) return NEUTRAL_CORR;
  const macroReturns = dailyReturns(macro);
  const corr = correlate(btcReturns, macroReturns);
  const last = macro.closes.length;
  const back30 = macro.closes[Math.max(0, last - 22)]; // ~22 trading days ≈ 30 calendar days
  const latest = macro.closes[last - 1];
  const return30dPct = back30 && back30 > 0 && latest ? ((latest - back30) / back30) * 100 : null;
  return { correlation30d: corr ? Math.round(corr.r * 1000) / 1000 : null, sampleSize: corr?.n ?? 0, return30dPct: return30dPct !== null ? Math.round(return30dPct * 100) / 100 : null };
}

export async function getMacroIntel(): Promise<MacroIntel> {
  const [dxySeries, spxSeries, goldSeries, btcSeries] = await Promise.all([
    fetchYahooDaily(MACRO_SYMBOLS.dxy),
    fetchYahooDaily(MACRO_SYMBOLS.spx),
    fetchYahooDaily(MACRO_SYMBOLS.gold),
    fetchBtcDaily(),
  ]);

  if (!btcSeries) return NEUTRAL;
  const btcReturns = dailyReturns(btcSeries);

  const dxy = macroLeg(dxySeries, btcReturns);
  const spx = macroLeg(spxSeries, btcReturns);
  const gold = macroLeg(goldSeries, btcReturns);

  if (!dxy.correlation30d && !spx.correlation30d && !gold.correlation30d) return NEUTRAL;

  // DXY correlation is normally negative (dollar strength = crypto headwind) — flip its
  // sign so "positive" always means "tailwind" across all three legs, consistently.
  const dxyTailwind = dxy.correlation30d !== null && dxy.return30dPct !== null ? -dxy.correlation30d * Math.sign(dxy.return30dPct || 1) : 0;
  const spxTailwind = spx.correlation30d !== null && spx.return30dPct !== null ? spx.correlation30d * Math.sign(spx.return30dPct || 1) : 0;

  let regime: MacroIntel["regime"] = "decoupled";
  if (spx.correlation30d !== null && spx.correlation30d > 0.4) {
    regime = (spx.return30dPct ?? 0) >= 0 ? "risk-on coupling" : "risk-off coupling";
  } else if (dxy.correlation30d !== null && dxy.correlation30d < -0.4 && (dxy.return30dPct ?? 0) > 1.5) {
    regime = "dollar headwind";
  } else if (!spx.correlation30d && !dxy.correlation30d) {
    regime = "insufficient_data";
  }

  const score = Math.round(clamp(50 + dxyTailwind * 25 + spxTailwind * 25));

  return { dxy, spx, gold, regime, score, generatedAt: Date.now() };
}
