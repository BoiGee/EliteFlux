// ============================================================
// Event Risk Scanner
// ------------------------------------------------------------
// Claude actively watching the news for market-moving crypto
// events — FOMC dates, ETF decisions, major unlocks, exchange or
// protocol incidents — instead of a static calendar or keyword
// feed. Two model calls: research (with live web search), then
// extraction into a structured, bounded schema. Cached for hours
// since this is advisory, not measured/calibrated like the other
// signal layers, and shared across every user and cron cycle.
// ============================================================

export interface EventRiskFlag {
  headline: string;
  category: "macro" | "regulatory" | "exchange" | "protocol" | "other";
  riskLevel: "low" | "elevated" | "high";
  summary: string;
  expectedWindow: string | null;
}

export interface EventRiskScan {
  flags: EventRiskFlag[];
  overallRisk: "low" | "elevated" | "high";
  generatedAt: number;
}

const NEUTRAL: EventRiskScan = { flags: [], overallRisk: "low", generatedAt: Date.now() };

async function researchEvents(): Promise<string | null> {
  try {
    const { generateText, stepCountIs } = await import("ai");
    const { anthropic } = await import("@ai-sdk/anthropic");
    const { text } = await generateText({
      // Sonnet handles web-research-and-summarize well at a fraction of
      // Opus's cost; this only runs a few times a day at most (4h cache).
      model: anthropic("claude-sonnet-5"),
      tools: { web_search: anthropic.tools.webSearch_20260209({ maxUses: 3 }) },
      stopWhen: stepCountIs(4),
      abortSignal: AbortSignal.timeout(120_000),
      system:
        "You are a crypto market risk analyst. Use web search (a couple of searches, not many) to find genuinely significant, dated or credibly imminent crypto-market-moving events in the next 0-14 days: FOMC/central bank rate decisions, major token unlocks, ETF approval/rejection decisions, exchange or protocol security incidents, and major regulatory deadlines. Ignore routine commentary, price predictions and generic news. Be concrete about dates where known. Be efficient — converge quickly rather than exhaustively researching every lead.",
      prompt:
        "Search for and summarize the most significant upcoming crypto-market-moving events in the next two weeks. For each: what it is, when, and why it matters for BTC/ETH/altcoin prices.",
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "medium" } },
    });
    return text || null;
  } catch (e) {
    console.error("event-risk research failed", e);
    return null;
  }
}

async function extractFlags(researchText: string): Promise<EventRiskScan> {
  try {
    const { generateObject } = await import("ai");
    const { anthropic } = await import("@ai-sdk/anthropic");
    const { z } = await import("zod");

    const { object } = await generateObject({
      // Pure structured extraction from text already produced above —
      // Haiku is plenty for reshaping, no fresh judgment needed.
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: z.object({
        flags: z
          .array(
            z.object({
              headline: z.string().max(140),
              category: z.enum(["macro", "regulatory", "exchange", "protocol", "other"]),
              riskLevel: z.enum(["low", "elevated", "high"]),
              summary: z.string().max(700),
              expectedWindow: z.string().max(60).nullable(),
            }),
          )
          .max(6),
        overallRisk: z.enum(["low", "elevated", "high"]),
      }),
      system:
        "Extract structured, dated crypto market event-risk flags from this research. Only include genuinely dated/scheduled or credibly imminent events, not general commentary or stale news. Keep each summary under 500 characters — tight and factual, not exhaustive. If nothing significant is present, return an empty flags array and overallRisk 'low'. overallRisk should reflect the single highest-risk flag, not an average.",
      prompt: researchText,
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
    });
    return { ...object, generatedAt: Date.now() };
  } catch (e) {
    console.error("event-risk extraction failed", e);
    return NEUTRAL;
  }
}

export async function getEventRiskScan(): Promise<EventRiskScan> {
  const { cached } = await import("./ttl-cache.server");
  return cached("event-risk-scan", { ttlMs: 4 * 3600_000, staleMs: 24 * 3600_000 }, async () => {
    const research = await researchEvents();
    if (!research) return NEUTRAL;
    return extractFlags(research);
  });
}
