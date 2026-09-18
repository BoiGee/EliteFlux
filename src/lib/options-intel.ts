// ============================================================
// Options Market Intelligence (Deribit)
// ------------------------------------------------------------
// Deribit is the dominant venue for BTC/ETH options and publishes
// its full order-book summary for free, unauthenticated. Real
// put/call ratio, implied volatility and max-pain — the same
// inputs professional desks watch — computed straight from the
// live option chain, not a proxy.
//
// avg30dIv is also persisted per cycle (same time-gated pattern as
// volatility-intel.ts) so it can be percentile-ranked against its own
// history — a point-in-time IV number alone can't tell you if today's
// reading is high or low for this asset.
// ============================================================

type Admin = { from: (t: string) => any };

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const DERIBIT = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency";
const TRACKED_CURRENCIES = ["BTC", "ETH"] as const;
type TrackedCurrency = (typeof TRACKED_CURRENCIES)[number];

interface DeribitInstrument {
  instrument_name: string;
  open_interest: number;
  volume: number;
  mark_iv?: number;
  underlying_price?: number;
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Deribit expiry codes look like "28AUG26" — day + month abbrev + 2-digit year, 08:00 UTC settle. */
function parseExpiry(code: string): Date | null {
  const m = code.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const month = MONTHS[m[2]!];
  if (month === undefined) return null;
  return new Date(Date.UTC(2000 + Number(m[3]), month, Number(m[1]), 8, 0, 0));
}

async function fetchOptionsChain(currency: TrackedCurrency): Promise<DeribitInstrument[] | null> {
  try {
    // No timeout here previously could hang the whole evaluate-alerts cycle
    // indefinitely on a single stalled response.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${DERIBIT}?currency=${currency}&kind=option`, {
      headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: DeribitInstrument[] };
    return json.result ?? null;
  } catch {
    return null;
  }
}

export interface NearestExpirySummary {
  expiry: string;
  daysToExpiry: number;
  putCallRatioOI: number | null;
  totalCallOI: number;
  totalPutOI: number;
  maxPainStrike: number | null;
}

export interface CurrencyOptionsIntel {
  underlyingPrice: number;
  putCallRatioOI: number | null; // across all expiries — >1 = more puts than calls (fear/hedging)
  totalCallOI: number;
  totalPutOI: number;
  avgIv30d: number | null; // OI-weighted mark IV across expiries inside 30 days
  /** 0..100 rank of avgIv30d vs this currency's own recent history. Null until enough history exists. */
  ivPercentile: number | null;
  ivRegime: "compressed" | "normal" | "expanded" | "unknown";
  nearestExpiry: NearestExpirySummary | null;
  /** 0..100. 50 = neutral. Below 50 = put-heavy positioning (fear); above = call-heavy (greed). */
  score: number;
}

export interface OptionsIntel {
  perCurrency: Partial<Record<TrackedCurrency, CurrencyOptionsIntel>>;
  generatedAt: number;
}

/** Strike that minimizes total intrinsic payout to option holders at nearest expiry — the "max pain" price. */
function computeMaxPain(calls: { strike: number; oi: number }[], puts: { strike: number; oi: number }[]): number | null {
  const strikes = [...new Set([...calls.map((c) => c.strike), ...puts.map((p) => p.strike)])].sort((a, b) => a - b);
  if (!strikes.length) return null;
  let best: number | null = null;
  let bestPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const c of calls) if (c.strike <= s) pain += (s - c.strike) * c.oi;
    for (const p of puts) if (p.strike >= s) pain += (p.strike - s) * p.oi;
    if (pain < bestPain) {
      bestPain = pain;
      best = s;
    }
  }
  return best;
}

function computeCurrencyIntel(instruments: DeribitInstrument[], now: number): CurrencyOptionsIntel {
  let totalCallOI = 0;
  let totalPutOI = 0;
  let ivWeightSum = 0;
  let ivWeight = 0;
  let underlyingPrice = 0;
  const byExpiry = new Map<string, { expiry: Date; calls: { strike: number; oi: number }[]; puts: { strike: number; oi: number }[] }>();

  for (const inst of instruments) {
    const parts = inst.instrument_name.split("-");
    if (parts.length !== 4) continue;
    const [, expiryCode, strikeStr, typeChar] = parts;
    const expiry = parseExpiry(expiryCode!);
    const strike = Number(strikeStr);
    const oi = inst.open_interest ?? 0;
    if (!expiry || !Number.isFinite(strike) || !Number.isFinite(oi)) continue;
    if (inst.underlying_price) underlyingPrice = inst.underlying_price;

    if (typeChar === "C") totalCallOI += oi;
    else if (typeChar === "P") totalPutOI += oi;

    const daysToExpiry = (expiry.getTime() - now) / 86_400_000;
    if (daysToExpiry > 0 && daysToExpiry <= 30 && typeof inst.mark_iv === "number" && inst.mark_iv > 0) {
      const w = oi + 1; // +1 so far-OTM/no-OI series still contribute a little, not zero
      ivWeightSum += inst.mark_iv * w;
      ivWeight += w;
    }

    const bucket = byExpiry.get(expiryCode!) ?? { expiry, calls: [], puts: [] };
    if (typeChar === "C") bucket.calls.push({ strike, oi });
    else if (typeChar === "P") bucket.puts.push({ strike, oi });
    byExpiry.set(expiryCode!, bucket);
  }

  let nearestKey: string | null = null;
  let nearestExpiryDate = Infinity;
  for (const [key, b] of byExpiry) {
    const t = b.expiry.getTime();
    if (t > now && t < nearestExpiryDate) {
      nearestExpiryDate = t;
      nearestKey = key;
    }
  }

  let nearestExpiry: NearestExpirySummary | null = null;
  if (nearestKey) {
    const b = byExpiry.get(nearestKey)!;
    const callOI = b.calls.reduce((a, c) => a + c.oi, 0);
    const putOI = b.puts.reduce((a, p) => a + p.oi, 0);
    nearestExpiry = {
      expiry: nearestKey,
      daysToExpiry: Math.round(((b.expiry.getTime() - now) / 86_400_000) * 10) / 10,
      putCallRatioOI: callOI > 0 ? Math.round((putOI / callOI) * 1000) / 1000 : null,
      totalCallOI: Math.round(callOI * 100) / 100,
      totalPutOI: Math.round(putOI * 100) / 100,
      maxPainStrike: computeMaxPain(b.calls, b.puts),
    };
  }

  const putCallRatioOI = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 1000) / 1000 : null;
  const avgIv30d = ivWeight > 0 ? Math.round((ivWeightSum / ivWeight) * 100) / 100 : null;

  // PCR of 1 is neutral; each 0.1 above/below shifts the score ~4pts. Fear (high PCR) pulls the
  // score down, greed (low PCR) pushes it up — standard options-sentiment convention.
  const score = Math.round(clamp(50 - ((putCallRatioOI ?? 1) - 1) * 40));

  return {
    underlyingPrice,
    putCallRatioOI,
    totalCallOI: Math.round(totalCallOI * 100) / 100,
    totalPutOI: Math.round(totalPutOI * 100) / 100,
    avgIv30d,
    ivPercentile: null,
    ivRegime: "unknown",
    nearestExpiry,
    score,
  };
}

const LOOKBACK_DAYS = 30;
const MIN_SAMPLES_FOR_PERCENTILE = 10;
let lastPersistAt = 0;
const PERSIST_INTERVAL_MS = 30 * 60_000;

function percentileRank(current: number, history: number[]): number {
  if (!history.length) return 50;
  const below = history.filter((h) => h < current).length;
  return Math.round((below / history.length) * 100);
}

async function maybePersistIv(admin: Admin, readings: { currency: string; avgIv: number }[]): Promise<void> {
  if (Date.now() - lastPersistAt < PERSIST_INTERVAL_MS) return;
  lastPersistAt = Date.now();
  try {
    await admin.from("options_iv_history").insert(readings.map((r) => ({ currency: r.currency, avg_iv: r.avgIv })));
  } catch {
    /* best effort */
  }
}

export async function getOptionsIntel(admin: Admin): Promise<OptionsIntel> {
  const now = Date.now();
  const chains = await Promise.all(TRACKED_CURRENCIES.map((c) => fetchOptionsChain(c)));

  const perCurrency: OptionsIntel["perCurrency"] = {};
  TRACKED_CURRENCIES.forEach((currency, i) => {
    const chain = chains[i];
    if (chain && chain.length) perCurrency[currency] = computeCurrencyIntel(chain, now);
  });

  const ivReadings = Object.entries(perCurrency)
    .filter(([, intel]) => intel && intel.avgIv30d !== null)
    .map(([currency, intel]) => ({ currency, avgIv: intel!.avgIv30d! }));
  void maybePersistIv(admin, ivReadings);

  try {
    const since = new Date(now - LOOKBACK_DAYS * 86400_000).toISOString();
    const { data } = await admin.from("options_iv_history").select("currency,avg_iv").gte("captured_at", since).limit(5000);
    const historyRows = (data ?? []) as { currency: string; avg_iv: number }[];
    const byCurrency = new Map<string, number[]>();
    for (const r of historyRows) {
      (byCurrency.get(r.currency) ?? byCurrency.set(r.currency, []).get(r.currency)!).push(r.avg_iv);
    }
    for (const { currency, avgIv } of ivReadings) {
      const hist = byCurrency.get(currency) ?? [];
      const intel = perCurrency[currency as TrackedCurrency];
      if (!intel || hist.length < MIN_SAMPLES_FOR_PERCENTILE) continue;
      const pct = percentileRank(avgIv, hist);
      intel.ivPercentile = pct;
      intel.ivRegime = pct <= 25 ? "compressed" : pct >= 75 ? "expanded" : "normal";
    }
  } catch {
    /* keep ivPercentile/ivRegime at their computeCurrencyIntel defaults */
  }

  return { perCurrency, generatedAt: now };
}
