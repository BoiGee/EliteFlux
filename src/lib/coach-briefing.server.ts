// Server-only: writes the user's session briefing with the EliteFlux Coach.
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getBrainSnapshotCached } from "./brain-server";
import { computeBehavior, type CallRow } from "./coach.server";
import type { CoachLevel } from "./coach-shared";
import { CHANGELOG } from "./coach-knowledge";

const LEVEL_TONE: Record<CoachLevel, string> = {
  beginner: "Plain language, no jargon. Explain what each number means in a few words.",
  intermediate: "Direct, define only unusual terms.",
  advanced: "Dense and signal-first, no definitions.",
  pro: "Terse desk note: read, implication, invalidation.",
};

export async function buildBriefing(userId: string) {
  if (!process.env["ANTHROPIC_API_KEY"]) throw new Error("The coach is not configured yet.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };

  const [{ data: prof }, { data: watch }, { data: calls }, r] = await Promise.all([
    admin.from("coach_profile").select("experience_level,goals").eq("user_id", userId).maybeSingle(),
    admin.from("watchlist_items").select("symbol").eq("user_id", userId),
    admin
      .from("coach_calls")
      .select("symbol,stance,source,entry_price,move_pct,score,grade,verdict,status,regime_at_call,flux_at_call,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    getBrainSnapshotCached(),
  ]);

  const level = (prof?.experience_level as CoachLevel) ?? "beginner";
  const symbols = ((watch ?? []) as { symbol: string }[]).map((w) => w.symbol);
  const behavior = computeBehavior((calls ?? []) as CallRow[]);
  const watched = r.snapshot.coinIntel
    .filter((c) => symbols.includes(c.symbol))
    .map((c) => `${c.symbol} $${c.price} (${c.change24h.toFixed(2)}% 24h, momentum ${c.momentum}, risk ${c.risk})`);

  const facts = {
    fluxScore: r.brain.eliteFluxScore,
    band: r.brain.band,
    regime: r.brain.regime,
    btcDominance: r.snapshot.marketOverview.btcDominance,
    liquidityFlow: r.snapshot.marketOverview.liquidityFlow,
    whale: `${r.whale.phase} (${r.whale.score})`,
    sentiment: `${r.sentiment.state} (${r.sentiment.score})`,
    exitPressure: r.exit.marketExitPressure,
    momentumIgnition: r.ignition.ignitionScore,
    leadingNarrative: r.narrative.topEmerging[0]?.label ?? "none",
    watchlist: watched.length ? watched : ["(empty watchlist)"],
    yourCalls: behavior.summary ?? "no graded calls yet",
    openCalls: behavior.open,
    confidence: r.brainV3?.confidence ?? null,
    newInEliteFlux: (() => {
      const latest = CHANGELOG[0];
      if (!latest) return null;
      // Only worth mentioning while it is genuinely recent.
      const age = Date.now() - new Date(latest.date).getTime();
      return age < 14 * 864e5 ? `${latest.title} — ${latest.detail}` : null;
    })(),
  };

  const result = streamText({
    // Sonnet, not Opus — this fires automatically on page load (up to once
    // per 6h per user) rather than a deliberate chat turn, so it shouldn't
    // carry the top-tier model's cost.
    model: anthropic("claude-sonnet-5"),
    system: [
      "You are Flux, the EliteFlux AI Coach, writing a user's session briefing.",
      "Write at most 140 words in short bullet points: (1) what the market is doing, (2) what it means for this user's watchlist, (3) one thing to watch or avoid today. If newInEliteFlux is present, add a final bullet starting 'New in EliteFlux:' in one plain sentence.",
      "If confidence is below 45, say plainly in the first bullet that today's read is low confidence and should be treated as a hint, not a plan.",
      "Use only the supplied readings. Never invent numbers, never name data providers or explain how the intelligence is built, and never give financial advice.",
      "Open with no greeting or preamble. Markdown bullets only.",
      LEVEL_TONE[level],
      behavior.patterns.length
        ? `If it fits naturally, reference one observed habit: ${behavior.patterns.map((p) => p.label).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    prompt: `Current EliteFlux readings:\n${JSON.stringify(facts, null, 2)}`,
    providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
  });

  const body = (await result.text).trim();
  const title = `Session briefing · ${r.brain.regime}`;

  const { data: saved } = await admin
    .from("coach_nudges")
    .insert({ user_id: userId, title, body, severity: "briefing", read: true })
    .select("id,title,body,created_at")
    .maybeSingle();

  return {
    id: saved?.id ?? "briefing",
    title,
    body,
    created_at: saved?.created_at ?? new Date().toISOString(),
    cached: false,
  };
}
