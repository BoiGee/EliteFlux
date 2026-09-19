// Server-only signal outcome tracking. Records what the engine claimed, then
// resolves what actually happened so the models can be measured and tuned.
import {
  SIGNAL_HORIZONS,
  isHit,
  type SignalPerf,
} from "./model-calibration";

type Admin = { from: (t: string) => any };

export interface SignalEventInput {
  signal_type: string;
  symbol: string | null;
  score: number;
  band?: string | null;
  regime?: string | null;
  confidence?: number | null;
  reference_price?: number | null;
  context?: Record<string, unknown>;
}

/** Longest horizon we keep an event open for, plus a grace window. */
const MAX_HORIZON_MS = Math.max(...SIGNAL_HORIZONS) * 3600_000;
const RESOLVE_GRACE_MS = 6 * 3600_000;

/** Write this cycle's signals to the scoreboard. Best effort — never throws. */
export async function recordSignalEvents(admin: Admin, events: SignalEventInput[]): Promise<number> {
  if (!events.length) return 0;
  try {
    const rows = events.map((e) => ({
      signal_type: e.signal_type,
      symbol: e.symbol,
      score: Math.round(e.score * 100) / 100,
      band: e.band ?? null,
      regime: e.regime ?? null,
      confidence: e.confidence ?? null,
      reference_price: e.reference_price ?? null,
      context: e.context ?? {},
    }));
    const { error } = await admin.from("signal_events").insert(rows);
    if (error) return 0;
    return rows.length;
  } catch {
    return 0;
  }
}

interface OpenEvent {
  id: string;
  signal_type: string;
  symbol: string | null;
  score: number;
  regime: string | null;
  reference_price: number | null;
  fired_at: string;
}

/**
 * Resolve every matured signal: compare its reference price against the
 * current price and store the realised forward return for each horizon.
 */
export async function resolveSignalOutcomes(
  admin: Admin,
  prices: Record<string, { price: number }>,
  marketProxySymbol = "BTC",
): Promise<{ resolved: number; closed: number }> {
  const now = Date.now();
  let resolved = 0;
  let closed = 0;

  const { data, error: selErr } = await admin
    .from("signal_events")
    .select("id,signal_type,symbol,score,regime,reference_price,fired_at")
    .is("resolved_at", null)
    .lte("fired_at", new Date(now - SIGNAL_HORIZONS[0]! * 3600_000).toISOString())
    .order("fired_at", { ascending: true })
    .limit(1000);
  // Previously unchecked — a failed SELECT here (any reason) silently
  // returned {resolved:0, closed:0} indistinguishable from "nothing to do",
  // exactly the "unchecked write/read error" pattern already found and
  // fixed elsewhere this session (system-runs.server.ts's finishRun).
  // Confirmed live: a real, multi-week backlog of unresolved signal_events
  // has stopped advancing despite the underlying query/update both working
  // correctly when run directly — this makes the real cause, whatever it
  // is, visible instead of indistinguishable from "no work available".
  if (selErr) {
    console.error("resolveSignalOutcomes: select failed", selErr);
    return { resolved, closed };
  }

  const events = (data ?? []) as OpenEvent[];
  if (!events.length) return { resolved, closed };

  const rows: Record<string, unknown>[] = [];
  const closeIds: string[] = [];

  for (const ev of events) {
    const firedAt = new Date(ev.fired_at).getTime();
    const ageMs = now - firedAt;
    const sym = ev.symbol ?? marketProxySymbol;
    const current = prices[sym]?.price;
    const entry = ev.reference_price;

    // Which horizons have matured since the last resolution pass?
    const matured = SIGNAL_HORIZONS.filter((h) => ageMs >= h * 3600_000);
    if (entry && entry > 0 && current && current > 0) {
      for (const h of matured) {
        // Only write the horizon that just matured within this cycle window,
        // plus any earlier ones missed — the unique index dedupes re-writes.
        const ret = ((current - entry) / entry) * 100;
        rows.push({
          event_id: ev.id,
          signal_type: ev.signal_type,
          symbol: ev.symbol,
          horizon_hours: h,
          entry_price: entry,
          exit_price: current,
          forward_return_pct: Math.round(ret * 1000) / 1000,
          hit: isHit(ev.signal_type, ev.score, ret),
          score: ev.score,
          regime: ev.regime,
        });
      }
    }

    if (ageMs >= MAX_HORIZON_MS + RESOLVE_GRACE_MS || (!entry && ageMs >= RESOLVE_GRACE_MS)) {
      closeIds.push(ev.id);
    }
  }

  if (rows.length) {
    const { error } = await admin
      .from("signal_outcomes")
      .upsert(rows, { onConflict: "event_id,horizon_hours", ignoreDuplicates: true });
    if (!error) resolved = rows.length;
    else console.error("resolveSignalOutcomes: upsert into signal_outcomes failed", error, { rowCount: rows.length });
  }
  if (closeIds.length) {
    // Confirmed live: with the full 1000-row fetch limit above almost
    // entirely eligible to close in one pass (a real, weeks-old backlog —
    // every event past MAX_HORIZON_MS+RESOLVE_GRACE_MS qualifies
    // regardless of pricing), .in("id", closeIds) with ~1000 UUIDs builds a
    // ~37,000-character query string that PostgREST rejects with a plain
    // 400 — confirmed by reproducing it directly against the live API.
    // That failure was previously silent (see the removed unconditional
    // `closed = closeIds.length` below): every event that should have
    // closed stayed at the front of "oldest unresolved" forever, so the
    // same ancient backlog got re-selected every single cycle instead of
    // the query ever advancing to more recent, more relevant signals —
    // effectively halting new pattern-learning while looking healthy in
    // every log that only checked "did this throw". Chunking keeps each
    // request's URL well under any such limit.
    const CHUNK = 200;
    let closedCount = 0;
    for (let i = 0; i < closeIds.length; i += CHUNK) {
      const chunk = closeIds.slice(i, i + CHUNK);
      const { error } = await admin
        .from("signal_events")
        .update({ resolved_at: new Date(now).toISOString() })
        .in("id", chunk);
      if (!error) closedCount += chunk.length;
      else console.error("resolveSignalOutcomes: close update failed for a chunk", error, { chunkSize: chunk.length });
    }
    closed = closedCount;
  }
  return { resolved, closed };
}

export interface AccuracyRow {
  signalType: string;
  horizonHours: number;
  samples: number;
  hits: number;
  hitRate: number;
  avgReturnPct: number;
}

/** Aggregate the scoreboard for the accuracy dashboard and the calibrator. */
/** Shared bucketing logic — group into signal_type|horizon buckets and derive hitRate/avgReturnPct. */
function bucketAccuracyRows(
  rows: { signal_type: string; horizon_hours: number; forward_return_pct: number | null; hit: boolean | null }[],
): AccuracyRow[] {
  const buckets = new Map<string, { samples: number; hits: number; ret: number }>();
  for (const r of rows) {
    if (r.hit === null) continue;
    const key = `${r.signal_type}|${r.horizon_hours}`;
    const b = buckets.get(key) ?? { samples: 0, hits: 0, ret: 0 };
    b.samples++;
    if (r.hit) b.hits++;
    b.ret += r.forward_return_pct ?? 0;
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .map(([key, b]) => {
      const [signalType, horizon] = key.split("|");
      return {
        signalType: signalType!,
        horizonHours: Number(horizon),
        samples: b.samples,
        hits: b.hits,
        hitRate: b.samples ? b.hits / b.samples : 0,
        avgReturnPct: b.samples ? b.ret / b.samples : 0,
      };
    })
    .sort((a, b) => b.samples - a.samples);
}

export async function loadAccuracy(
  admin: Admin,
  opts: { days?: number; horizon?: number; regime?: string; untilDaysAgo?: number } = {},
): Promise<AccuracyRow[]> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let q = admin
    .from("signal_outcomes")
    .select("signal_type,horizon_hours,forward_return_pct,hit")
    .gte("resolved_at", since)
    .limit(20000);
  if (opts.horizon) q = q.eq("horizon_hours", opts.horizon);
  if (opts.regime) q = q.eq("regime", opts.regime);
  if (opts.untilDaysAgo) {
    const until = new Date(Date.now() - opts.untilDaysAgo * 86400_000).toISOString();
    q = q.lt("resolved_at", until);
  }
  const { data } = await q;
  return bucketAccuracyRows((data ?? []) as { signal_type: string; horizon_hours: number; forward_return_pct: number | null; hit: boolean | null }[]);
}

interface RawAccuracyRow {
  signal_type: string;
  horizon_hours: number;
  forward_return_pct: number | null;
  hit: boolean | null;
  regime: string | null;
  resolved_at: string;
}

/**
 * Fetch every resolved outcome in the last `days`, once, including regime
 * and resolved_at — for a caller that needs several different (day-window,
 * regime) slices of the same underlying data (recomputeRecommendationWeights:
 * a global 7d/60d pair plus a 14d/90d pair PER regime — 12 separate
 * loadAccuracy queries previously), every slice can be derived from this one
 * fetch via accuracySlice() below instead of one query per slice. Confirmed
 * live this was a real contributor to "Too many subrequests by single
 * Worker invocation" — each loadAccuracy call is one subrequest, and this
 * function alone accounted for up to 12 of them every cold cycle.
 */
async function loadRawAccuracyRows(admin: Admin, days: number): Promise<RawAccuracyRow[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await admin
    .from("signal_outcomes")
    .select("signal_type,horizon_hours,forward_return_pct,hit,regime,resolved_at")
    .gte("resolved_at", since)
    .limit(20000);
  return (data ?? []) as RawAccuracyRow[];
}

/** Derive one (days, regime) slice from rows already fetched by loadRawAccuracyRows — no query. */
function accuracySlice(rows: RawAccuracyRow[], days: number, regime?: string): AccuracyRow[] {
  const sinceMs = Date.now() - days * 86400_000;
  const filtered = rows.filter((r) => {
    if (new Date(r.resolved_at).getTime() < sinceMs) return false;
    if (regime !== undefined && r.regime !== regime) return false;
    return true;
  });
  return bucketAccuracyRows(filtered);
}

const SCORE_BANDS = [
  { min: 0, max: 20 },
  { min: 20, max: 40 },
  { min: 40, max: 60 },
  { min: 60, max: 80 },
  { min: 80, max: 100 },
] as const;

/**
 * Measured hit rate per 0-100 score band for one signal type — the input
 * calibrateScore() (model-calibration.ts) needs to turn a raw score into
 * what it's actually been worth historically, instead of raw enthusiasm.
 */
export async function loadScoreBands(
  admin: Admin,
  signalType: string,
  opts: { horizon?: number; days?: number } = {},
): Promise<import("./model-calibration").ScoreBand[]> {
  const horizon = opts.horizon ?? 24;
  const days = opts.days ?? 60;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await admin
    .from("signal_outcomes")
    .select("score,hit")
    .eq("signal_type", signalType)
    .eq("horizon_hours", horizon)
    .not("hit", "is", null)
    .gte("resolved_at", since)
    .limit(20000);

  const rows = (data ?? []) as { score: number; hit: boolean }[];
  return SCORE_BANDS.map((b) => {
    const inBand = rows.filter((r) => r.score >= b.min && r.score <= b.max);
    const hits = inBand.filter((r) => r.hit).length;
    return { min: b.min, max: b.max, hitRate: inBand.length ? hits / inBand.length : 0, samples: inBand.length };
  });
}

/** Reshape accuracy rows into the perf map the weight deriver expects. */
export function perfMap(rows: AccuracyRow[], horizon = 24): Record<string, SignalPerf> {
  const out: Record<string, SignalPerf> = {};
  for (const r of rows) {
    if (r.horizonHours !== horizon) continue;
    out[r.signalType] = { samples: r.samples, hitRate: r.hitRate, avgReturnPct: r.avgReturnPct };
  }
  return out;
}

const MIN_HORIZON_SAMPLES = 10;

/**
 * Same idea as perfMap, but not pinned to one horizon — a signal's natural
 * resolution time isn't necessarily 24h (a momentum-ignition call plausibly
 * plays out in 1-4h; a whale-accumulation thesis plausibly needs a week).
 * `rows` from loadAccuracy() without a horizon filter already contains all
 * four tracked horizons for every signal type in one query, so this costs
 * nothing extra — for each signal, pick whichever horizon shows the
 * strongest directional edge among those with enough samples to trust,
 * falling back to whatever exists otherwise (deriveWeights' own trust
 * damping keeps a low-sample pick from moving much either way).
 */
export function bestPerfMap(rows: AccuracyRow[], minSamples = MIN_HORIZON_SAMPLES): Record<string, SignalPerf> {
  const bySignal = new Map<string, AccuracyRow[]>();
  for (const r of rows) {
    (bySignal.get(r.signalType) ?? bySignal.set(r.signalType, []).get(r.signalType)!).push(r);
  }
  const out: Record<string, SignalPerf> = {};
  for (const [signal, variants] of bySignal) {
    const qualifying = variants.filter((v) => v.samples >= minSamples);
    const pool = qualifying.length ? qualifying : variants;
    const best = pool.reduce((a, b) => (Math.abs(b.hitRate - 0.5) > Math.abs(a.hitRate - 0.5) ? b : a));
    out[signal] = { samples: best.samples, hitRate: best.hitRate, avgReturnPct: best.avgReturnPct };
  }
  return out;
}

export interface WinLossStats {
  winRate: number;
  avgWinPct: number; // average |return| on hits
  avgLossPct: number; // average |return| on misses
  sampleSize: number;
}

/** Separate win/loss magnitudes (not just a blended hit rate) — what Kelly sizing needs. */
export async function loadWinLossStats(
  admin: Admin,
  opts: { signalType: string; regime?: string | null; horizon?: number; days?: number },
): Promise<WinLossStats | null> {
  const horizon = opts.horizon ?? 24;
  const days = opts.days ?? 60;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let q = admin
    .from("signal_outcomes")
    .select("hit,forward_return_pct")
    .eq("signal_type", opts.signalType)
    .eq("horizon_hours", horizon)
    .gte("resolved_at", since)
    .not("hit", "is", null)
    .limit(5000);
  if (opts.regime) q = q.eq("regime", opts.regime);
  const { data } = await q;

  const rows = (data ?? []) as { hit: boolean | null; forward_return_pct: number | null }[];
  if (!rows.length) return null;

  const wins = rows.filter((r) => r.hit === true);
  const losses = rows.filter((r) => r.hit === false);
  const avgWinPct = wins.length ? wins.reduce((a, r) => a + Math.abs(r.forward_return_pct ?? 0), 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((a, r) => a + Math.abs(r.forward_return_pct ?? 0), 0) / losses.length : 0;

  return { winRate: wins.length / rows.length, avgWinPct, avgLossPct, sampleSize: rows.length };
}

/** Persist a freshly derived weight set, and read the newest one back. */
export async function saveModelWeights(
  admin: Admin,
  model: string,
  weights: Record<string, number>,
  sampleSize: number,
): Promise<void> {
  try {
    await admin.from("model_weights").insert({ model, weights, sample_size: sampleSize });
  } catch {
    /* best effort */
  }
}

export async function loadModelWeights(
  admin: Admin,
  model: string,
): Promise<{ weights: Record<string, number>; sampleSize: number; computedAt: string } | null> {
  try {
    const { data } = await admin
      .from("model_weights")
      .select("weights,sample_size,computed_at")
      .eq("model", model)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as { weights: Record<string, number>; sample_size: number; computed_at: string };
    return { weights: row.weights, sampleSize: row.sample_size, computedAt: row.computed_at };
  } catch {
    return null;
  }
}

/** Recommendation-layer name -> the signal family that measures it. */
const LAYER_TO_SIGNAL: Record<string, string> = {
  whale: "whale",
  smartMoney: "smart_money",
  sentiment: "sentiment",
  narrative: "narrative",
  pressure: "pump_pressure",
  onchain: "smart_money",
  relativeToBtc: "momentum",
  derivatives: "derivatives",
  orderbook: "orderbook",
  social: "social",
  stablecoin: "stablecoin",
  confluence: "confluence",
  options: "options",
  macro: "macro",
  crossExchange: "cross_exchange",
  // Exact match, unlike relativeToBtc's approximation above — the
  // "momentum" signal_type recorded in buildSignalEvents (brain-server.ts)
  // literally comes from ignition.ignitionScore / ignition.signals.
  ignition: "momentum",
};

/**
 * elite-brain.ts's seven flagship-score sub-layers -> the signal family that
 * measures each. whale/sentiment map onto the exact same score elite-brain
 * blends in; narrative maps onto the closest tracked proxy (elite-brain's
 * own narrativeScore formula differs slightly from narrative-engine's
 * aggregateStrength, same pattern already used for onchain->smart_money
 * above). bitcoin/liquidity/altcoin/risk were never tracked before this —
 * see buildSignalEvents in brain-server.ts.
 */
export const ELITE_BRAIN_LAYER_TO_SIGNAL: Record<string, string> = {
  bitcoin: "btc_control",
  liquidity: "liquidity_flow",
  narrative: "narrative",
  altcoin: "altcoin_strength",
  risk: "risk_compression",
  whale: "whale",
  sentiment: "sentiment",
};

async function deriveWeightsForRows(
  recentRows: AccuracyRow[],
  longRows: AccuracyRow[],
  base: Record<string, number>,
  layerToSignal: Record<string, string> = LAYER_TO_SIGNAL,
): Promise<{ weights: Record<string, number>; sampleSize: number; drifting: string[] }> {
  const { deriveWeights, detectDrift } = await import("./model-calibration");
  const recent = bestPerfMap(recentRows);
  const long = bestPerfMap(longRows);

  const perf: Record<string, SignalPerf | undefined> = {};
  const drifting: string[] = [];
  for (const [layer, signal] of Object.entries(layerToSignal)) {
    const l = long[signal];
    const r = recent[signal];
    const drift = detectDrift(r, l);
    if (drift.drifting) {
      drifting.push(layer);
      // A degrading layer is judged on its recent, worse form.
      perf[layer] = r;
    } else {
      perf[layer] = l ?? r;
    }
  }

  const weights = deriveWeights(base, perf);
  // Sampled at the 24h mark specifically for this count, even though
  // individual layers above may have picked a different horizon to derive
  // from — longRows can contain all 4 tracked horizons per signal (the same
  // underlying event resolves at each), so summing every row here would
  // multiply-count and inflate this figure well past what actually backs it.
  const sampleSize = longRows.filter((r) => r.horizonHours === 24).reduce((a, r) => a + r.samples, 0);
  return { weights, sampleSize, drifting };
}

/** The regime buckets weights get specialized for — mirrors elite-brain.ts's MarketRegime. */
export const KNOWN_REGIMES = [
  "Risk-On Expansion",
  "Risk-Off De-risking",
  "Altcoin Rotation",
  "Meme Speculation",
  "Consolidation / Chop",
] as const;

/** Minimum resolved samples in a regime bucket before its own weight set is trusted. */
const MIN_REGIME_SAMPLES = 25;
/** Minimum number of *distinct* signal families that must individually clear MIN_FAMILY_SAMPLES. */
const MIN_REGIME_FAMILIES = 4;
const MIN_FAMILY_SAMPLES = 5;

/**
 * The aggregate MIN_REGIME_SAMPLES check alone can be satisfied by one
 * well-sampled family plus a dozen near-empty ones — deriveWeights' own
 * per-layer trust damping keeps any single sparse layer from moving much,
 * but the regime-specific *set* still gets shipped and presented as if all
 * families were meaningfully evidenced. Require real breadth, not just
 * volume, before trusting a regime bucket.
 */
export function hasEnoughBreadth(rows: AccuracyRow[]): boolean {
  const distinctFamilies = new Set(rows.map((r) => r.signalType));
  let clearing = 0;
  for (const signal of distinctFamilies) {
    const total = rows.filter((r) => r.signalType === signal).reduce((a, r) => a + r.samples, 0);
    if (total >= MIN_FAMILY_SAMPLES) clearing++;
  }
  return clearing >= MIN_REGIME_FAMILIES;
}

/**
 * Validate a candidate weight set before it ships, using two independent
 * checks that catch different failure modes: walkForwardValidate asks
 * "does deriving weights this way generalize out-of-sample," backtestWeights
 * asks "would this specific candidate have scored better than what's live
 * right now." Neither alone covers both cases — walkForwardValidate always
 * re-derives from BASE_RECOMMENDATION_WEIGHTS and never exercises the
 * recent/long drift-selection logic in deriveWeightsForRows, so a bad
 * candidate caused by that logic overreacting to a noisy window wouldn't
 * show up there; backtestWeights only checks in-sample.
 *
 * Both scans are 20k-row queries — too heavy to re-run every 5-minute cycle
 * for no benefit (a 60-90 day window can't move meaningfully that fast), so
 * the combined verdict is cached hourly, not recomputed every call.
 */
/** The actual pass/fail rule, isolated so it's testable without mocking the DB calls around it. */
export function combinedShipVerdict(walkForwardVerdict: string, backtestVerdict: string): boolean {
  return walkForwardVerdict !== "overfits" && backtestVerdict !== "regression";
}

async function evaluateShipGate(
  admin: Admin,
  candidate: Record<string, number>,
  regime?: string,
): Promise<{ ship: boolean; walkForward: string; backtest: string }> {
  const { cached } = await import("./ttl-cache.server");
  const key = regime ? `weight-gate:recommendation:${regime}` : "weight-gate:recommendation";
  return cached(key, { ttlMs: 3600_000, staleMs: 24 * 3600_000 }, async () => {
    const { walkForwardValidate, backtestWeights } = await import("./backtest.server");
    const [wf, bt] = await Promise.all([
      walkForwardValidate(admin, { horizon: 24, regime }),
      backtestWeights(admin, candidate, { horizon: 24, regime }),
    ]);
    return {
      ship: combinedShipVerdict(wf.verdict, bt.verdict),
      walkForward: wf.verdict,
      backtest: bt.verdict,
    };
  });
}

/**
 * Recompute the opportunity blend from measured 24h accuracy, persist it, and
 * hand it back for immediate use. Layers with no history keep their base
 * weight, so this is safe from the very first run.
 *
 * Also derives a *per-regime* weight set — a signal's predictive power isn't
 * constant across market conditions (whale accumulation means something
 * different in "Meme Speculation" than in "Risk-Off De-risking"), and we
 * already tag every signal with the regime it fired in. Regimes with too few
 * resolved samples fall back to the global blend rather than overfitting to
 * a handful of outcomes.
 *
 * Every candidate is validated by evaluateShipGate before it ships — a
 * rejected candidate never reaches saveModelWeights, and the function
 * returns whatever was already live instead (never the rejected candidate,
 * since the return value feeds directly into this cycle's live scoring).
 */
export async function recomputeRecommendationWeights(
  admin: Admin,
): Promise<{
  weights: Record<string, number>;
  sampleSize: number;
  drifting: string[];
  byRegime: Record<string, { weights: Record<string, number>; sampleSize: number }>;
  gate: { global: { ship: boolean; walkForward: string; backtest: string }; regimes: Record<string, { ship: boolean; walkForward: string; backtest: string }> };
}> {
  const { BASE_RECOMMENDATION_WEIGHTS } = await import("./recommendation-engine");

  // One fetch (90 days — the widest window any slice below needs) instead of
  // 12 separate loadAccuracy queries (a global 7d/60d pair, plus a 14d/90d
  // pair for each of the 5 regimes below) — every slice is derived from this
  // one result set in memory via accuracySlice(). See loadRawAccuracyRows's
  // own comment for why this mattered live, not just in theory.
  const rawAccuracyRows = await loadRawAccuracyRows(admin, 90);

  // No horizon filter — deriveWeightsForRows picks the best-performing
  // horizon per signal itself; fetching all four here costs nothing extra
  // (loadAccuracy returns every tracked horizon in one query either way).
  const recentRows = accuracySlice(rawAccuracyRows, 7);
  const longRows = accuracySlice(rawAccuracyRows, 60);
  const global = await deriveWeightsForRows(recentRows, longRows, BASE_RECOMMENDATION_WEIGHTS);
  const globalGate = await evaluateShipGate(admin, global.weights);

  let shippedGlobal = global.weights;
  if (globalGate.ship) {
    await saveModelWeights(admin, "recommendation", global.weights, global.sampleSize);
  } else {
    const last = await loadModelWeights(admin, "recommendation");
    shippedGlobal = last?.weights ?? BASE_RECOMMENDATION_WEIGHTS;
  }

  const byRegime: Record<string, { weights: Record<string, number>; sampleSize: number }> = {};
  const regimeGates: Record<string, { ship: boolean; walkForward: string; backtest: string }> = {};
  await Promise.all(
    KNOWN_REGIMES.map(async (regime) => {
      const rRecent = accuracySlice(rawAccuracyRows, 14, regime);
      const rLong = accuracySlice(rawAccuracyRows, 90, regime);
      // Gate specifically off the 24h-horizon subset — rLong otherwise
      // contains all 4 tracked horizons per signal (same event, multiple
      // resolutions), which would multiply-count and make this gate too easy.
      const rLong24 = rLong.filter((r) => r.horizonHours === 24);
      const sampleSize = rLong24.reduce((a, r) => a + r.samples, 0);
      if (sampleSize < MIN_REGIME_SAMPLES || !hasEnoughBreadth(rLong24)) return; // not enough evidence yet — global blend wins
      const derived = await deriveWeightsForRows(rRecent, rLong, shippedGlobal);
      const regimeGate = await evaluateShipGate(admin, derived.weights, regime);
      regimeGates[regime] = regimeGate;
      if (regimeGate.ship) {
        await saveModelWeights(admin, `recommendation:${regime}`, derived.weights, sampleSize);
        byRegime[regime] = { weights: derived.weights, sampleSize };
      } else {
        const last = await loadModelWeights(admin, `recommendation:${regime}`);
        if (last) byRegime[regime] = { weights: last.weights, sampleSize: last.sampleSize };
        // else: no previous regime-specific set either — omitting from byRegime
        // means callers fall back to shippedGlobal, which is already validated.
      }
    }),
  );

  return {
    weights: shippedGlobal,
    sampleSize: global.sampleSize,
    drifting: global.drifting,
    byRegime,
    gate: { global: globalGate, regimes: regimeGates },
  };
}

/**
 * Same idea as recomputeRecommendationWeights, for elite-brain's own flagship
 * score. flux_score has always been recorded and graded (buildSignalEvents,
 * brain-server.ts) — this is what actually closes the loop and lets that
 * measurement change the formula, instead of the score being permanently
 * fixed regardless of how it grades.
 *
 * Deliberately lighter-weight than the recommendation path: no walk-forward/
 * backtest gate here (that machinery is hardwired to the recommendation
 * engine's own layer set — generalizing it further is a separate, larger
 * change). Safety instead comes from deriveWeights' own bound (±50% of base,
 * floored at 40%) — this is a slow-burn fix that will take real calendar
 * time to accumulate enough samples per layer before it visibly does
 * anything, by design.
 */
export async function recomputeEliteBrainWeights(
  admin: Admin,
): Promise<{ weights: Record<string, number>; sampleSize: number; drifting: string[] }> {
  const { BASE_ELITE_BRAIN_WEIGHTS } = await import("./elite-brain");
  const [recentRows, longRows] = await Promise.all([
    loadAccuracy(admin, { days: 7 }),
    loadAccuracy(admin, { days: 60 }),
  ]);
  const derived = await deriveWeightsForRows(recentRows, longRows, BASE_ELITE_BRAIN_WEIGHTS, ELITE_BRAIN_LAYER_TO_SIGNAL);
  await saveModelWeights(admin, "elite-brain", derived.weights, derived.sampleSize);
  return derived;
}
