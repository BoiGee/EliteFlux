// ============================================================
// Kelly-Criterion Position Sizing
// ============================================================
// Not a new data layer — a payoff on the ML calibration work: once
// a signal has a real measured hit probability and real average
// win/loss magnitudes, that's enough to compute actual expected
// edge and a disciplined position-size suggestion instead of just
// a 0-100 score. Half-Kelly (not full) and a hard cap, because this
// is a guardrail for a retail product, not a bankroll-maximizer —
// model error means full Kelly overshoots in practice.
//
// This is informational sizing guidance, not financial advice, and
// is capped and fractionalized deliberately conservative.
// ============================================================
import { loadWinLossStats } from "./signal-tracking.server";

type Admin = { from: (t: string) => any };

export interface PersonalSizingStats {
  winRate: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  sampleSize: number;
  note: string;
}

export interface KellySizing {
  hitProbability: number; // 0..1
  avgWinPct: number;
  avgLossPct: number;
  winLossRatio: number | null;
  fullKellyFraction: number; // can be negative — a negative edge is a real, useful result
  suggestedSizePct: number; // 0 when edge isn't positive
  edge: "positive" | "negative" | "unclear";
  sampleSize: number;
  rationale: string;
  /** The caller's own graded call history, separate from the platform-wide numbers above. */
  personal?: PersonalSizingStats;
}

const FRACTIONAL_KELLY = 0.5; // half-Kelly: model error means full Kelly overshoots in practice
const MAX_SUGGESTED_SIZE_PCT = 10; // hard cap regardless of the math
const MIN_SAMPLES = 30;
const EDGE_THRESHOLD = 0.03;

const MIN_PERSONAL_SAMPLES = 10; // a personal journal will always be far smaller than the platform-wide scoreboard

/**
 * The caller's own track record, from their graded coach_calls — a win is a
 * graded call with score > 0 (same convention CoachChat's behavior summary
 * already uses). Separate from the platform-wide Kelly numbers on purpose:
 * this answers "how have MY calls actually done," not "how has the engine done."
 */
export async function computePersonalKellyStats(admin: Admin, userId: string): Promise<PersonalSizingStats> {
  try {
    const { data } = await admin
      .from("coach_calls")
      .select("score,move_pct")
      .eq("user_id", userId)
      .eq("status", "graded")
      .not("score", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = (data ?? []) as { score: number | null; move_pct: number | null }[];
    if (rows.length < MIN_PERSONAL_SAMPLES) {
      return {
        winRate: null,
        avgWinPct: null,
        avgLossPct: null,
        sampleSize: rows.length,
        note: `Not enough graded calls yet in your own journal (${rows.length}/${MIN_PERSONAL_SAMPLES}) to show a personal track record — log calls with the coach to build one.`,
      };
    }

    const wins = rows.filter((r) => (r.score ?? 0) > 0);
    const losses = rows.filter((r) => (r.score ?? 0) <= 0);
    const avgWinPct = wins.length ? wins.reduce((a, r) => a + Math.abs(r.move_pct ?? 0), 0) / wins.length : 0;
    const avgLossPct = losses.length ? losses.reduce((a, r) => a + Math.abs(r.move_pct ?? 0), 0) / losses.length : 0;
    const winRate = wins.length / rows.length;

    return {
      winRate: Math.round(winRate * 1000) / 1000,
      avgWinPct: Math.round(avgWinPct * 100) / 100,
      avgLossPct: Math.round(avgLossPct * 100) / 100,
      sampleSize: rows.length,
      note: `Your own graded calls: ${wins.length}/${rows.length} winners (${Math.round(winRate * 100)}%).`,
    };
  } catch {
    return { winRate: null, avgWinPct: null, avgLossPct: null, sampleSize: 0, note: "Personal track record unavailable right now." };
  }
}

function insufficientData(sampleSize: number): KellySizing {
  return {
    hitProbability: 0.5,
    avgWinPct: 0,
    avgLossPct: 0,
    winLossRatio: null,
    fullKellyFraction: 0,
    suggestedSizePct: 0,
    edge: "unclear",
    sampleSize,
    rationale: "Not enough measured outcomes yet for this signal and regime to size a position responsibly.",
  };
}

/**
 * Suggested position size for an opportunity at `score` in the current `regime`,
 * derived from the signal's own measured (not assumed) hit rate and win/loss
 * magnitudes. Defaults to the composite flux_score calibration when no more
 * specific signal type is given — i.e. "how should I size an opportunity that
 * scored this well, given how often scores like this have actually paid off."
 */
export async function computeSuggestedSizing(
  admin: Admin,
  opts: { score: number; regime: string | null; signalType?: string; userId?: string },
): Promise<KellySizing> {
  const signalType = opts.signalType ?? "flux_score";

  const [stats, mlProb, personal] = await Promise.all([
    loadWinLossStats(admin, { signalType, regime: opts.regime ?? undefined }),
    (async () => {
      try {
        const { predictHitProbability } = await import("./ml-model.server");
        return await predictHitProbability(admin, signalType, opts.score, opts.regime);
      } catch {
        return null;
      }
    })(),
    opts.userId ? computePersonalKellyStats(admin, opts.userId) : Promise.resolve(undefined),
  ]);

  if (!stats || stats.sampleSize < MIN_SAMPLES) return { ...insufficientData(stats?.sampleSize ?? 0), personal };

  // predictHitProbability (ml-model.server.ts) is an external model call with
  // no contract enforcement of its own — a bad regime lookup or a model bug
  // could hand back a value outside 0..1. Nothing downstream re-clamps this
  // specific value: it's shown directly to users (the rounded field below)
  // and feeds the rationale text's "measured hit rate X%" framing, both of
  // which would otherwise show impossible numbers like a negative or >100%
  // hit rate. clampedFull (below) only protects the final size percentage,
  // not this value or the rationale built from it.
  const hitProbability = Math.max(0, Math.min(1, mlProb ?? stats.winRate));
  const winLossRatio = stats.avgLossPct > 0 ? stats.avgWinPct / stats.avgLossPct : null;
  const b = winLossRatio ?? 1;
  const q = 1 - hitProbability;
  const fullKelly = b > 0 ? (hitProbability * b - q) / b : -1;

  const edge: KellySizing["edge"] = fullKelly > EDGE_THRESHOLD ? "positive" : fullKelly < -EDGE_THRESHOLD ? "negative" : "unclear";
  const clampedFull = Math.max(0, Math.min(1, fullKelly));
  const suggestedSizePct = edge === "positive" ? Math.round(Math.min(MAX_SUGGESTED_SIZE_PCT, clampedFull * FRACTIONAL_KELLY * 100) * 10) / 10 : 0;

  const rationale =
    edge === "positive"
      ? `Measured hit rate ${Math.round(hitProbability * 100)}% with an average win/loss ratio of ${winLossRatio ? winLossRatio.toFixed(2) : "n/a"}x implies a real edge — half-Kelly suggests up to ${suggestedSizePct}% of capital. This is a guardrail, not a guarantee: markets change and this is measured on the past.`
      : edge === "negative"
        ? `Measured performance at this score/regime does not show a positive edge (hit rate ${Math.round(hitProbability * 100)}%, win/loss ratio ${winLossRatio ? winLossRatio.toFixed(2) : "n/a"}x) — sizing up here isn't supported by the data.`
        : "The edge is too small to be distinguishable from noise at this sample size — treat this as informational, not a sizing signal.";

  return {
    hitProbability: Math.round(hitProbability * 1000) / 1000,
    avgWinPct: Math.round(stats.avgWinPct * 100) / 100,
    avgLossPct: Math.round(stats.avgLossPct * 100) / 100,
    winLossRatio: winLossRatio !== null ? Math.round(winLossRatio * 100) / 100 : null,
    fullKellyFraction: Math.round(fullKelly * 1000) / 1000,
    suggestedSizePct,
    edge,
    sampleSize: stats.sampleSize,
    rationale,
    personal,
  };
}
