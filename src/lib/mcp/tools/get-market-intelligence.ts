import { defineTool } from "../protocol";
import { getBrainSnapshotCached } from "@/lib/brain-server";
import { callerTier, meetsTier, notAuthenticated, upgradeNotice } from "../tier";

export default defineTool({
  name: "get_market_intelligence",
  title: "Get market intelligence",
  description:
    "Current EliteFlux market intelligence: ELITE FLUX SCORE, market regime, whale phase, sentiment, narratives and pump pressure from live Binance/CoinGecko data. Depth of the response depends on the signed-in user's plan.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated;
    const tier = await callerTier(ctx);

    const { brain, brainV3, whale, sentiment, narrative, pressure, confidence, generatedAt } =
      await getBrainSnapshotCached();

    const payload: Record<string, unknown> = {
      generatedAt: new Date(generatedAt).toISOString(),
      plan: tier,
      confidence: { score: confidence.score, band: confidence.band, reasons: confidence.reasons },
      disclaimer: "Market intelligence only — not financial advice.",
    };

    // PRO layers
    if (meetsTier(tier, "pro")) {
      payload.insight = brain.insight;
      payload.sentiment = { score: sentiment.score, state: sentiment.state, trend: sentiment.trend };
    } else {
      payload.locked_pro = upgradeNotice("pro", tier);
    }

    // ELITE layers — eliteFluxScore/band/regime/headline match tier-matrix.ts's
    // "elite-brain" key, narrative matches "narrative-detect": both Elite-only,
    // not Operator. These used to sit unconditionally at the top of the
    // payload / behind the PRO check — an Operator (or even free) caller got
    // the full flux score and narrative read for free.
    if (meetsTier(tier, "elite")) {
      payload.eliteFluxScore = brain.eliteFluxScore;
      payload.band = brain.band;
      payload.regime = brain.regime;
      payload.headline = brain.headline;
      payload.narrative = {
        aggregateStrength: narrative.aggregateStrength,
        topEmerging: narrative.topEmerging,
      };
      payload.whale = { score: whale.score, phase: whale.phase, impact: whale.impact, methodology: whale.methodology };
      payload.cognition = {
        regime: brainV3.regime,
        confidence: brainV3.confidence,
        score: brainV3.cognitionScore,
      };
      payload.pumpPressure = {
        score: pressure.score,
        band: pressure.band,
        rationale: pressure.rationale,
      };
    } else {
      payload.locked_elite = upgradeNotice("elite", tier);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
