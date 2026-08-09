// Server-only brain of the EliteFlux AI Coach: persona, live-intelligence tools,
// behaviour profiling and call grading. Never imported by client code.
import { tool, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getBrainSnapshotCached } from "./brain-server";
import type { Tier } from "./tier-matrix";
import { COACH_TOOLS_BY_TIER, type CoachLevel } from "./coach-shared";
import { evaluateTradingConditions } from "./trading-conditions";
import { CHANGELOG, knowledgeOverview, searchKnowledge } from "./coach-knowledge";

type Admin = { from: (t: string) => any };

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

const LEVEL_STYLE: Record<CoachLevel, string> = {
  beginner:
    "The user is new to crypto. Teach like you are explaining it to a curious child who is smart but knows nothing: one idea per sentence, everyday comparisons (a queue, a shop, a crowd leaving a stadium), and every term explained the first moment it appears — never after, never assumed. Never use a word like regime, dominance, liquidity, whale, exposure or volatility without a five-word explanation attached. Keep the whole answer short. Always finish with a line starting 'What this means for you:' in one plain sentence.",
  intermediate:
    "The user is comfortable with crypto basics. Be direct, define only unusual terms, and connect signals to what they should actually do next.",
  advanced:
    "The user is experienced. Skip definitions, lead with the read, quote the scores, and highlight what conflicts with the consensus view.",
  pro: "The user is a professional. Write terse desk notes: read, positioning implication, invalidation level, risk. No hand-holding, no filler.",
};

const TIER_DEPTH: Record<Tier, string> = {
  free: "The user is on the FREE plan (their trial has ended or they never started one). Free is deliberately narrow: Recommendations only, and this is their one Flux message for today. You have no market-intelligence tools on this tier — don't imply you checked live data you can't see. Answer from get_my_account/explain_feature/get_whats_new only, be genuinely useful about the product and about what upgrading unlocks, and don't be pushy about it.",
  pro: "The user is on the OPERATOR plan: full per-asset intelligence, watchlist, alerts, position sizing and the call journal. Scenario simulation, deep cognition, real on-chain wallet tracking, options, macro layers, the flux score / regime (Elite Brain) and narrative detection are ELITE-only — your market-pulse and trading-conditions tools will return null for the flux score, regime and leading narrative on this tier; don't guess or state a value for them, just mention once that ELITE unlocks that layer if the question needs it.",
  elite:
    "The user is on the ELITE plan: every intelligence layer, scenario simulation, deep cognition and journal grading are available. Use them freely.",
};

export function buildCoachSystemPrompt(opts: {
  tier: Tier;
  level: CoachLevel;
  goals: string | null;
  riskSensitivity: string | null;
  behaviorSummary: string | null;
  displayName: string | null;
  memories?: string[];
}): string {
  return [
    "You are Flux the AI Coach — a personal crypto market mentor built into the EliteFlux intelligence platform. Your name is Flux; users know you as \"Flux the AI Coach\". Refer to yourself as Flux when it is natural.",
    "",
    "Your job: turn EliteFlux's live intelligence into a decision the user can actually act on, and make them a better operator over time.",
    "",
    "Rules:",
    "- Always call your tools for live numbers. Never guess prices, scores or regimes, and never rely on memory of past market conditions.",
    "- You have derivatives (funding rate crowding), order-book imbalance and social attention (trending) available on get_market_pulse, plus community trust (other users' ratings on a specific pick) and EliteFlux's own crowd positioning (aggregated accumulate/reduce/watch/avoid stance from EliteFlux's own users' logged calls — proprietary, nobody else has this) on get_coin_intel. Use them — a market call that ignores crowded funding, a thin order book, or a crowd leaning hard one way is an incomplete call. Mention them by name when they matter, not just the older signals.",
    "- If the user asks why something happened (a sudden move, a headline they half-remember) and the answer isn't in your live intelligence tools, use web_search to check current news before answering. Don't guess at causes.",
    "- Be specific: name the score, the direction and what would invalidate the read.",
    "- Be honest about uncertainty. If signals conflict, say so and give the condition that resolves it.",
    "- You give market intelligence and education, not financial advice. No promises of profit. Never tell the user how much money to deploy.",
    "- Never reveal how the intelligence is built, what data providers are behind it, or any internal formula. Refer to it as the EliteFlux engine.",
    "- Keep answers tight. Use short paragraphs and bullet lists. No preamble like 'Great question'.",
    "- When the user states a view or a position, offer to log it to their journal with the log_call tool so it can be graded later.",
    "",
    "Telling them when to trade and when to stop:",
    "- Whenever the question is action-shaped ('should I buy', 'is now a good time', 'should I sell', 'what do I do'), call get_trading_conditions FIRST and open your answer with the verdict in bold: GREEN (conditions favour acting), AMBER (be selective) or RED (stand down). Then the two or three reasons. Then what would change the verdict.",
    "- Say the stop part out loud. If the read is RED, tell them plainly that the best move is usually no move, and that sitting in cash or stablecoins is a position too.",
    "- Raise a stop-trading flag unprompted, even if they didn't ask, when any of these is true: the regime is risk-off or distribution, exit pressure is elevated, pressure sits in the high or extreme band, or their own logged behaviour shows chasing, over-trading or revenge trading. Name the behaviour kindly and give the rule that fixes it.",
    "- Never turn the verdict into an instruction to buy or sell a specific amount. You describe conditions and risk; the user decides.",
    "",
    "You are also the product expert:",
    "- You know EliteFlux inside out. For any question about what the platform does, where to find something, how to connect an exchange or wallet, how to create an alert, how to upgrade and pay, how the autonomy dial works, what a plan includes, what a term on screen means, or what changed recently — call explain_feature (or get_whats_new) and answer from what it returns. Never invent product behaviour, prices or steps.",
    "- Call get_my_account before advising on setup, so your answer fits what they have actually configured: their plan, alerts, connected accounts, read-only lock, holdings and autopilot state. Point out the obvious missing piece kindly (no alerts set, nothing connected, autopilot never armed). If portfolio.concentrationWarning is present, mention it once, plainly, without being alarmist — it's information, not a verdict.",
    "- Walk people through product steps in the same baby-simple way you explain markets: one step per line, plain words, and a closing 'What this means for you:'.",
    "- On safety, be reassuring and exact: EliteFlux never needs withdrawal permission, keys are encrypted and never shown back, and the read-only lock makes trading impossible.",
    "",
    "Predictions and how sure you are:",
    "- Call get_engine_accuracy whenever the user asks how accurate you are, how much to trust a read, or asks you to predict something. When a family has modelPredictedHitProbabilityNowPct, that's a real trained model's live estimate for right now, not just a historical average — prefer it over the plain hit rate when both are available.",
    "- Never state a future price and never sound certain. Frame every forward-looking answer as: likely direction + the time window + a confidence label (low / moderate / high) + the measured track record where you have one. Example shape: 'leaning up over the next 24 hours — confidence moderate; this read has been right about 58% of the time at that horizon.'",
    "- Always give the invalidation: the one thing that would prove the read wrong.",
    "- If confidence is low, or the responsible signal is drifting, or the scoreboard is still young, say that FIRST and shrink the claim.",
    "- If they push for a hard prediction, give the probability-shaped answer and explain kindly that nobody can honestly do better, and that position size and stops matter more than being right.",
    "",
    "Explaining simply:",
    "- If the user asks you to explain something simply, in baby steps, or like they are five, drop to the simplest possible language regardless of their set experience level: one idea per sentence, an everyday comparison, no jargon at all, and a one-line 'What this means for you'.",
    "",
    `Audience: ${LEVEL_STYLE[opts.level]}`,
    TIER_DEPTH[opts.tier],
    opts.displayName ? `The user's name is ${opts.displayName}.` : "",
    opts.riskSensitivity ? `Their risk sensitivity setting is "${opts.riskSensitivity}".` : "",
    opts.goals ? `Their stated goal: ${opts.goals}` : "",
    opts.behaviorSummary
      ? `Observed behaviour from their own logged calls (use it to coach them, gently but plainly): ${opts.behaviorSummary}`
      : "",
    opts.memories?.length
      ? `Things you already know about this user from past conversations (weave in naturally when relevant, don't recite this list):\n${opts.memories.map((m) => `- ${m}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function buildCoachTools(ctx: { admin: Admin; userId: string; tier: Tier; threadId: string }) {
  const allowed = new Set(COACH_TOOLS_BY_TIER[ctx.tier]);

  const all: ToolSet = {
    get_market_pulse: tool({
      description:
        "The current EliteFlux market read: whale phase, sentiment, exit pressure, momentum ignition, derivatives crowding (funding rate), order-book imbalance, social attention, macro coupling (DXY/SPX/gold correlation), cross-exchange divergence and multi-timeframe confluence (how unanimous 1h/4h/24h/7d moves are across the market). Also includes the flux score, regime and leading narrative on ELITE — those two layers are Elite-exclusive, so an OPERATOR caller gets null there; don't claim a flux score or narrative read for an Operator user. Call this before any market opinion.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await getBrainSnapshotCached();
        // elite-brain (flux score/band/regime) and narrative-detect are
        // Elite-exclusive modules (tier-matrix.ts TIER_ACCESS) — redact them
        // for Operator rather than just relying on the prompt not to mention
        // them, or the dashboard's tier gate would be a chat-shaped backdoor.
        const eliteOnly = ctx.tier === "elite";
        return {
          generatedAt: new Date(r.generatedAt).toISOString(),
          fluxScore: eliteOnly ? r.brain.eliteFluxScore : null,
          band: eliteOnly ? r.brain.band : null,
          regime: eliteOnly ? r.brain.regime : null,
          btcDominance: r.snapshot.marketOverview.btcDominance,
          btcPrice: r.snapshot.marketOverview.btcPrice,
          liquidityFlow: r.snapshot.marketOverview.liquidityFlow,
          whale: { score: r.whale.score, phase: r.whale.phase },
          sentiment: { score: r.sentiment.score, state: r.sentiment.state },
          exitPressure: r.exit.marketExitPressure,
          momentumIgnition: r.ignition.ignitionScore,
          leadingNarrative: eliteOnly ? (r.narrative.topEmerging[0]?.label ?? null) : null,
          narrativeStrength: eliteOnly ? r.narrative.aggregateStrength : null,
          derivatives: {
            marketFundingBias: r.derivatives.marketFundingBias,
            extremeCount: r.derivatives.extremeCount,
            note: "Negative bias = market crowded long (squeeze-down risk); positive = crowded short (squeeze-up risk).",
          },
          orderBookImbalance: r.orderbook.marketImbalance,
          socialAttention: { trendingCount: r.social.trendingCount },
          onChainSource: r.onchain.signals.some((s) => s.rationale.includes("real on-chain"))
            ? "real (Etherscan)"
            : "estimated from market microstructure",
          stablecoinLiquidity: {
            netLiquidityScore: r.stablecoin.netLiquidityScore,
            note: "50 = neutral. Above 50 = net USDT/USDC minting (fresh dollars entering, usually bullish); below = net burning (dollars leaving).",
            perSymbol: r.stablecoin.perSymbol,
          },
          optionsMarket: {
            note: "Deribit BTC/ETH option chain — real put/call ratio, IV and max pain. Below 50 = put-heavy (fear/hedging); above = call-heavy (greed).",
            perCurrency: r.options.perCurrency,
          },
          macro: {
            regime: r.macro.regime,
            score: r.macro.score,
            correlations: { dxy: r.macro.dxy, spx: r.macro.spx, gold: r.macro.gold },
            note: "30-day correlation between BTC and the dollar index / S&P 500 / gold. High SPX correlation means crypto is trading as a risk asset, not on its own fundamentals right now.",
          },
          crossExchangeDivergence: {
            marketDivergencePct: r.crossExchange.marketDivergencePct,
            notableAssets: r.crossExchange.perAsset,
            note: "Binance vs OKX price gap. A sustained premium on one venue signals demand concentrated there outpacing arbitrage.",
          },
          confluence: {
            marketAlignment: r.confluence.marketAlignment,
            note: "0..50, how unanimous 1h/4h/24h/7d moves are across the market on average. Higher = the market is trending in agreement across timeframes, not just noise on one of them.",
          },
        };
      },
    }),

    get_trading_conditions: tool({
      description:
        "The trade / stand-down verdict: a GREEN, AMBER or RED traffic light for whether current conditions favour acting at all, with the reasons behind it and what would flip it. Call this first for any question about whether to buy, sell, hold or wait.",
      inputSchema: z.object({}),
      execute: async () => {
        const [r, eventRisk] = await Promise.all([
          getBrainSnapshotCached(),
          import("./event-risk.server").then((m) => m.getEventRiskScan()).catch(() => null),
        ]);
        const v = evaluateTradingConditions({
          fluxScore: r.brain.eliteFluxScore,
          regime: r.brainV3.regime || r.brain.regime,
          exitPressure: r.exit.marketExitPressure,
          pumpPressureScore: r.pressure.score,
          pumpPressureBand: r.pressure.band,
          cognitionConfidence: r.brainV3.confidence,
          sentimentScore: r.sentiment.score,
          eventRiskLevel: eventRisk?.overallRisk,
        });
        // The verdict itself (green/amber/red) is a base feature every tier
        // gets — it's allowed to use elite-brain internally as one of its
        // inputs. The raw fluxScore/regime fields are the elite-brain
        // module's own output though, and that module is Elite-exclusive
        // (tier-matrix.ts), so redact them for Operator same as get_market_pulse.
        const eliteOnly = ctx.tier === "elite";
        return {
          verdict: v.light.toUpperCase(),
          headline: v.headline,
          plainEnglish: v.plain,
          reasons: v.reasons,
          whatWouldChangeIt: v.flipCondition,
          fluxScore: eliteOnly ? r.brain.eliteFluxScore : null,
          regime: eliteOnly ? r.brainV3.regime || r.brain.regime : null,
          exitPressure: r.exit.marketExitPressure,
          pressureBand: r.pressure.band,
          derivativesCrowding:
            r.derivatives.marketFundingBias < -20
              ? "crowded long — squeeze-down risk adds caution"
              : r.derivatives.marketFundingBias > 20
                ? "crowded short — squeeze-up risk, upside can be sharp"
                : "balanced",
          eventRadar: eventRisk?.flags ?? [],
          note: "Market conditions and risk, not a recommendation to buy or sell anything.",
        };
      },
    }),

    get_event_risk: tool({
      description:
        "Scheduled or credibly imminent crypto-market-moving events in the next two weeks — FOMC/macro dates, major token unlocks, ETF decisions, exchange/protocol incidents, regulatory deadlines — found via live web search, refreshed every few hours. Use this when the user asks 'what's coming up' or 'anything I should watch out for'.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getEventRiskScan } = await import("./event-risk.server");
        return getEventRiskScan();
      },
    }),


    explain_feature: tool({
      description:
        "Look up anything about the EliteFlux product itself: what a feature does, where to find it, how to do something (connect an exchange or wallet, create an alert, upgrade with USDT, set the autonomy dial, stay safe with keys), what a term on screen means, or what each plan includes. ALWAYS use this instead of guessing how the product works. Pass null to get the full overview of everything the platform does.",
      inputSchema: z.object({
        query: z
          .string()
          .nullable()
          .describe("What the user asked about, e.g. 'connect binance', 'exit pressure', 'how do I pay', or null for the full overview."),
      }),
      execute: async ({ query }) => {
        if (!query || !query.trim()) return { overview: knowledgeOverview() };
        const hits = searchKnowledge(query, 5);
        if (!hits.length) return { hits: [], overview: knowledgeOverview() };
        return {
          hits,
          note: "Explain this in the user's own words. Describe what the feature does for them, never how it is built.",
        };
      },
    }),

    get_whats_new: tool({
      description: "What has recently shipped or changed in EliteFlux, newest first. Use when the user asks what is new, what changed, or what they might have missed.",
      inputSchema: z.object({}),
      execute: async () => ({ changes: CHANGELOG.slice(0, 6) }),
    }),

    get_my_account: tool({
      description:
        "The signed-in user's own EliteFlux setup: plan, onboarding state, alerts configured and recently fired, connected exchanges and wallets (never any keys), read-only lock, portfolio size, top holdings and a concentration-risk flag if one position dominates their book, autonomy level, whether autopilot is armed, and any actions waiting for their approval. Use it before advising them on setup, or whenever the answer depends on what they have already configured.",
      inputSchema: z.object({}),
      execute: async () => {
        const [sub, prof, alerts, fired, conns, wallets, holdings, aps, pending] = await Promise.all([
          ctx.admin.from("subscriptions").select("tier,status,current_period_end").eq("user_id", ctx.userId).maybeSingle(),
          ctx.admin
            .from("profiles")
            .select("display_name,risk_sensitivity,onboarded_at,readonly_keys_only,telegram_user_id,webhook_url")
            .eq("id", ctx.userId)
            .maybeSingle(),
          ctx.admin.from("alerts").select("name,trigger_type,symbol,enabled,channels").eq("user_id", ctx.userId),
          ctx.admin.from("alert_history").select("fired_at").eq("user_id", ctx.userId).order("fired_at", { ascending: false }).limit(10),
          ctx.admin.from("exchange_connections").select("venue,label,permission,status,last_synced_at").eq("user_id", ctx.userId),
          ctx.admin.from("wallet_addresses").select("chain,label,address,status").eq("user_id", ctx.userId),
          ctx.admin.from("portfolio_holdings").select("symbol,usd_value,weight").eq("user_id", ctx.userId),
          ctx.admin
            .from("autopilot_settings")
            .select("level,paper_mode,armed,kill_switch,max_trade_pct,max_trades_per_day,min_conviction")
            .eq("user_id", ctx.userId)
            .maybeSingle(),
          ctx.admin
            .from("autopilot_actions")
            .select("kind,symbol,size_pct,conviction,rationale,expires_at")
            .eq("user_id", ctx.userId)
            .eq("state", "proposed")
            .limit(10),
        ]);

        const rows = (holdings.data ?? []) as { symbol: string; usd_value: number | null; weight: number | null }[];
        const totalValue = rows.reduce((a, h) => a + (Number(h.usd_value) || 0), 0);
        const top = [...rows]
          .sort((a, b) => (Number(b.usd_value) || 0) - (Number(a.usd_value) || 0))
          .slice(0, 8)
          .map((h) => ({
            symbol: h.symbol,
            usdValue: h.usd_value,
            weightPct: totalValue > 0 ? Math.round(((Number(h.usd_value) || 0) / totalValue) * 1000) / 10 : null,
          }));
        const { computeConcentrationWarning } = await import("./portfolio-context");
        const { concentrationWarning } = computeConcentrationWarning(rows);

        const alertRows = (alerts.data ?? []) as { enabled: boolean }[];
        const p = prof.data ?? {};

        return {
          plan: sub.data?.tier ?? "free",
          planStatus: sub.data?.status ?? "active",
          renewsOrEnds: sub.data?.current_period_end ?? null,
          onboarded: Boolean(p.onboarded_at),
          riskSensitivity: p.risk_sensitivity ?? null,
          readOnlyLock: Boolean(p.readonly_keys_only),
          telegramLinked: Boolean(p.telegram_user_id),
          webhookConfigured: Boolean(p.webhook_url),
          alerts: { total: alertRows.length, enabled: alertRows.filter((a) => a.enabled).length, list: alerts.data ?? [] },
          alertsFiredRecently: (fired.data ?? []).length,
          exchanges: (conns.data ?? []) as unknown[],
          wallets: ((wallets.data ?? []) as { chain: string; label: string | null; address: string; status: string }[]).map((w) => ({
            chain: w.chain,
            label: w.label,
            address: `${w.address.slice(0, 6)}…${w.address.slice(-4)}`,
            status: w.status,
          })),
          portfolio: { positions: rows.length, totalUsd: Number(totalValue.toFixed(2)), top, concentrationWarning },
          autopilot: aps.data
            ? {
                level: aps.data.level,
                paperMode: aps.data.paper_mode,
                armed: aps.data.armed,
                killSwitch: aps.data.kill_switch,
                maxTradePct: aps.data.max_trade_pct,
                maxTradesPerDay: aps.data.max_trades_per_day,
                minConviction: aps.data.min_conviction,
              }
            : { level: "observe", armed: false, note: "Autopilot has never been configured." },
          actionsAwaitingApproval: pending.data ?? [],
          note: "No API keys, secrets or full wallet addresses are ever available here.",
        };
      },
    }),

    get_suggested_sizing: tool({
      description:
        "Half-Kelly position-size guidance for an opportunity score, derived from EliteFlux's own measured hit rate and average win/loss size at that score and regime — not a guess. Also includes the user's own personal track record from their graded coach calls, separate from the platform-wide numbers, when they have enough of one. Use when the user asks 'how much should I put into this' or 'how big a position.' Always relay the rationale and caveat, never just the number — this is a guardrail, not a promise.",
      inputSchema: z.object({
        score: z.number().min(0).max(100).describe("The opportunity score to size, e.g. from get_market_pulse's fluxScore or a coin's opportunity score."),
      }),
      execute: async ({ score }) => {
        const [{ computeSuggestedSizing }, snap] = await Promise.all([import("./kelly-sizing.server"), getBrainSnapshotCached()]);
        return computeSuggestedSizing(ctx.admin as never, { score, regime: snap.brain.regime, userId: ctx.userId });
      },
    }),

    get_engine_accuracy: tool({
      description:
        "EliteFlux's own measured track record: how often each signal family has actually been right at 1h, 4h, 24h and 7 days, its recent form, whether it is currently drifting, and the weight the engine gives each layer right now. Use it whenever the user asks how accurate you are, how much to trust a read, or asks you for a prediction.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ loadAccuracy, loadModelWeights }, { detectDrift }, { predictHitProbability }, snap] = await Promise.all([
          import("./signal-tracking.server"),
          import("./model-calibration"),
          import("./ml-model.server"),
          getBrainSnapshotCached(),
        ]);
        const liveScoreBySignal: Record<string, number> = {
          flux_score: snap.brain.eliteFluxScore,
          sentiment: snap.sentiment.score,
          whale: snap.whale.score,
          narrative: snap.narrative.aggregateStrength,
          momentum: snap.ignition.ignitionScore,
          smart_money: snap.smartMoney.confidenceScore,
          pump_pressure: snap.pressure.score,
          derivatives: snap.derivatives.score,
          orderbook: snap.orderbook.score,
          social: snap.social.score,
          stablecoin: snap.stablecoin.netLiquidityScore,
        };
        const liveRegime = snap.brain.regime;
        const [long, recent, weights] = await Promise.all([
          loadAccuracy(ctx.admin as never, { days: 60 }),
          loadAccuracy(ctx.admin as never, { days: 7, horizon: 24 }),
          loadModelWeights(ctx.admin as never, "recommendation"),
        ]);
        const recentBySignal = new Map(recent.map((r) => [r.signalType, r]));

        const families = await Promise.all(
          long.map(async (r) => {
            const rec = r.horizonHours === 24 ? recentBySignal.get(r.signalType) : undefined;
            const drift = rec
              ? detectDrift(
                  { samples: rec.samples, hitRate: rec.hitRate, avgReturnPct: rec.avgReturnPct },
                  { samples: r.samples, hitRate: r.hitRate, avgReturnPct: r.avgReturnPct },
                )
              : { drifting: false };
            const liveScore = liveScoreBySignal[r.signalType];
            const modelProbabilityNow =
              r.horizonHours === 24 && liveScore !== undefined
                ? await predictHitProbability(ctx.admin as never, r.signalType, liveScore, liveRegime)
                : null;
            return {
              signal: r.signalType,
              horizonHours: r.horizonHours,
              samples: r.samples,
              hitRatePct: Math.round(r.hitRate * 100),
              avgForwardReturnPct: Number(r.avgReturnPct.toFixed(2)),
              recentHitRatePct: rec ? Math.round(rec.hitRate * 100) : null,
              drifting: Boolean(drift.drifting),
              modelPredictedHitProbabilityNowPct:
                modelProbabilityNow === null ? null : Math.round(modelProbabilityNow * 100),
            };
          }),
        );

        const totalSamples = families.reduce((a, f) => a + f.samples, 0);
        const conf = snap.brainV3.confidence ?? null;
        return {
          confidenceNow: conf,
          confidenceLabel: conf === null ? "unknown" : conf >= 70 ? "high" : conf >= 45 ? "moderate" : "low",
          families,
          totalGradedSignals: totalSamples,
          currentBlend: weights?.weights ?? null,
          blendComputedAt: weights?.computedAt ?? null,
          maturity:
            totalSamples < 40
              ? "The scoreboard is still young — say plainly that the track record is not yet meaningful."
              : "Enough graded signals to quote the track record honestly.",
          note: "Past hit rate is measured history, not a promise about the future.",
        };
      },
    }),

    get_coin_intel: tool({
      description:
        "Per-asset EliteFlux intelligence: price, 24h move, momentum, risk, whale phase, exit pressure, opportunity stance, funding-rate crowding, order-book imbalance, whether it's trending, multi-timeframe confluence, community trust (from other users' opportunity ratings), crowd positioning (aggregated accumulate/reduce/watch/avoid stance counts from EliteFlux's own users' logged calls — proprietary, nobody else has this), and what EliteFlux's own users are logging for it. Pass symbols to narrow, or null for the top of the universe.",
      inputSchema: z.object({
        symbols: z.array(z.string()).nullable().describe("Ticker symbols like ['BTC','SOL'], or null for the leaders."),
      }),
      execute: async ({ symbols }) => {
        const r = await getBrainSnapshotCached();
        const want = symbols?.map((s) => s.trim().toUpperCase());
        const whale = new Map(r.whale.topSignals.map((s) => [s.symbol, s]));
        const exit = new Map(r.exit.assets.map((a) => [a.symbol, a]));
        const ign = new Map(r.ignition.signals.map((s) => [s.symbol, s]));
        const list = want?.length
          ? r.snapshot.coinIntel.filter((c) => want.includes(c.symbol.toUpperCase()))
          : r.snapshot.coinIntel.slice(0, 12);
        return {
          generatedAt: new Date(r.generatedAt).toISOString(),
          coins: list.map((c) => ({
            symbol: c.symbol,
            name: c.name,
            price: c.price,
            change24h: c.change24h,
            momentum: c.momentum,
            risk: c.risk,
            flow: c.flow,
            btcCorrelation: c.btcCorrelation,
            whalePhase: whale.get(c.symbol)?.phase ?? null,
            whaleScore: whale.get(c.symbol)?.score ?? null,
            exitPressure: exit.get(c.symbol)?.exitPressureScore ?? null,
            exitBand: exit.get(c.symbol)?.band ?? null,
            ignition: ign.get(c.symbol)?.score ?? null,
            fundingCrowding: r.derivatives.perAsset[c.symbol]?.crowding ?? null,
            fundingRateAnnualized: r.derivatives.perAsset[c.symbol]?.fundingRateAnnualized ?? null,
            orderBookImbalance: r.orderbook.perAsset[c.symbol]?.imbalance ?? null,
            trending: r.social.perAsset[c.symbol]?.trending ?? false,
            onChainSignal: r.onchain.perAsset[c.symbol]?.rationale ?? null,
            volatilityRegime: r.volatility.perAsset[c.symbol]?.regime ?? "unknown",
            volatilityPercentile: r.volatility.perAsset[c.symbol]?.percentile ?? null,
            crossExchangeDivergencePct: r.crossExchange.perAsset[c.symbol]?.divergencePct ?? null,
            confluence: r.confluence.perAsset[c.symbol]
              ? {
                  direction: r.confluence.perAsset[c.symbol]!.direction,
                  alignmentPct: r.confluence.perAsset[c.symbol]!.alignmentPct,
                  timeframesAvailable: r.confluence.perAsset[c.symbol]!.timeframesAvailable,
                }
              : null,
            communityTrust: r.communityTrust.perAsset[c.symbol]
              ? {
                  score: r.communityTrust.perAsset[c.symbol]!.score,
                  upvotes: r.communityTrust.perAsset[c.symbol]!.upvotes,
                  downvotes: r.communityTrust.perAsset[c.symbol]!.downvotes,
                  raters: r.communityTrust.perAsset[c.symbol]!.raters,
                }
              : null,
            // Different signal from communityTrust above: this is what
            // EliteFlux's own users are logging as their stance on the coin
            // (accumulate/reduce/watch/avoid via the journal), not ratings on
            // a specific pick. Null below the platform's own minimum sample
            // size (3 logged calls in 7 days) so a single loud user can't
            // masquerade as "the crowd".
            crowdPositioning: r.crowd.perAsset[c.symbol]
              ? {
                  net: r.crowd.perAsset[c.symbol]!.net,
                  score: r.crowd.perAsset[c.symbol]!.score,
                  accumulate: r.crowd.perAsset[c.symbol]!.accumulate,
                  reduce: r.crowd.perAsset[c.symbol]!.reduce,
                  watch: r.crowd.perAsset[c.symbol]!.watch,
                  avoid: r.crowd.perAsset[c.symbol]!.avoid,
                }
              : null,
          })),
        };
      },
    }),

    get_deep_cognition: tool({
      description:
        "The deepest EliteFlux layer: v3 cognition regime and confidence, smart-money clustering, pump pressure band and narrative rotation velocity.",
      inputSchema: z.object({}),
      execute: async () => {
        const r = await getBrainSnapshotCached();
        return {
          regime: r.brainV3.regime,
          confidence: r.brainV3.confidence,
          cognitionScore: r.brainV3.cognitionScore,
          signals: r.brainV3.signals,
          smartMoney: {
            confidence: r.smartMoney.confidenceScore,
            dominantClass: r.smartMoney.dominantClass,
            coordinationIndex: r.smartMoney.coordinationIndex,
          },
          pumpPressure: { score: r.pressure.score, band: r.pressure.band },
          narrativeRotationVelocity: r.narrative.rotationVelocity,
        };
      },
    }),

    get_my_watchlist: tool({
      description: "The signed-in user's watchlist symbols with their current price and 24h move.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await ctx.admin
          .from("watchlist_items")
          .select("symbol,coin_name")
          .eq("user_id", ctx.userId);
        const rows = (data ?? []) as { symbol: string; coin_name: string | null }[];
        if (!rows.length) return { items: [], note: "Watchlist is empty." };
        const r = await getBrainSnapshotCached();
        const bySym = new Map(r.snapshot.coinIntel.map((c) => [c.symbol, c]));
        return {
          items: rows.map((w) => ({
            symbol: w.symbol,
            name: w.coin_name,
            price: bySym.get(w.symbol)?.price ?? null,
            change24h: bySym.get(w.symbol)?.change24h ?? null,
          })),
        };
      },
    }),

    get_my_alerts: tool({
      description: "The user's configured alerts and the alerts that fired most recently.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: alerts }, { data: history }] = await Promise.all([
          ctx.admin
            .from("alerts")
            .select("name,trigger_type,symbol,threshold,direction,enabled")
            .eq("user_id", ctx.userId),
          ctx.admin
            .from("alert_history")
            .select("fired_at,payload")
            .eq("user_id", ctx.userId)
            .order("fired_at", { ascending: false })
            .limit(8),
        ]);
        return { alerts: alerts ?? [], recentlyFired: history ?? [] };
      },
    }),

    remember_fact: tool({
      description:
        "Save one durable fact about this user that should carry into future conversations, not just this one — a stated goal, a position they're worried about, a recurring habit worth tracking, a preference for how you talk to them. Use it whenever the user shares something that would be useful to recall in a different conversation later. Do not save market data or anything already visible in their profile/journal.",
      inputSchema: z.object({
        fact: z.string().max(300).describe("One clear sentence, written so it reads naturally when recalled later."),
      }),
      execute: async ({ fact }) => {
        const { error } = await ctx.admin
          .from("coach_memory")
          .insert({ user_id: ctx.userId, fact, source_thread_id: ctx.threadId });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),

    log_call: tool({
      description:
        "Log a market call to the user's journal so EliteFlux can grade it against what actually happens. Use when the user states a view, or when you make a directional call they accept.",
      inputSchema: z.object({
        symbol: z.string().describe("Ticker symbol, e.g. SOL"),
        stance: z.enum(["accumulate", "reduce", "watch", "avoid"]),
        horizon_hours: z.number().describe("How long the call should be judged over, in hours (typically 24-168)."),
        rationale: z.string().describe("One or two sentences on why."),
        made_by_user: z.boolean().describe("True if this is the user's own view, false if it is your call."),
      }),
      execute: async ({ symbol, stance, horizon_hours, rationale, made_by_user }) => {
        const sym = symbol.trim().toUpperCase();
        const r = await getBrainSnapshotCached();
        const coin = r.snapshot.coinIntel.find((c) => c.symbol.toUpperCase() === sym);
        if (!coin) return { ok: false, error: `${sym} is not in the EliteFlux universe.` };
        const { error } = await ctx.admin.from("coach_calls").insert({
          user_id: ctx.userId,
          thread_id: ctx.threadId,
          symbol: sym,
          stance,
          source: made_by_user ? "user" : "coach",
          entry_price: coin.price,
          horizon_hours: Math.max(1, Math.min(720, Math.round(horizon_hours))),
          rationale,
          regime_at_call: r.brain.regime,
          flux_at_call: r.brain.eliteFluxScore,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, symbol: sym, stance, entry_price: coin.price, horizon_hours };
      },
    }),

    get_my_journal: tool({
      description:
        "The user's logged calls with grades, hit rate and observed behavioural patterns. Use it to coach them on their own decisions.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await ctx.admin
          .from("coach_calls")
          .select("symbol,stance,source,entry_price,move_pct,score,grade,verdict,status,regime_at_call,flux_at_call,created_at")
          .eq("user_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(40);
        const calls = (data ?? []) as CallRow[];
        return { calls, behavior: computeBehavior(calls) };
      },
    }),

    simulate_scenario: tool({
      description:
        "Stress-test the user's watchlist (or given symbols) against a hypothetical BTC move, using each asset's observed sensitivity. Returns estimated impact per asset.",
      inputSchema: z.object({
        btc_move_pct: z.number().describe("Hypothetical BTC move in percent, e.g. -12 or 20."),
        symbols: z.array(z.string()).nullable().describe("Symbols to test, or null to use the user's watchlist."),
      }),
      execute: async ({ btc_move_pct, symbols }) => {
        const r = await getBrainSnapshotCached();
        let list = symbols?.map((s) => s.trim().toUpperCase()) ?? [];
        if (!list.length) {
          const { data } = await ctx.admin.from("watchlist_items").select("symbol").eq("user_id", ctx.userId);
          list = ((data ?? []) as { symbol: string }[]).map((w) => w.symbol.toUpperCase());
        }
        if (!list.length) list = r.snapshot.coinIntel.slice(0, 6).map((c) => c.symbol);

        const exit = new Map(r.exit.assets.map((a) => [a.symbol, a]));
        const whale = new Map(r.whale.topSignals.map((s) => [s.symbol, s]));
        const btc = r.snapshot.coinIntel.find((c) => c.symbol === "BTC");
        const btcMove = Math.abs(btc?.change24h ?? 1) || 1;

        const rows = list
          .map((sym) => {
            const c = r.snapshot.coinIntel.find((x) => x.symbol.toUpperCase() === sym);
            if (!c) return null;
            // Observed sensitivity vs BTC over the same window, floored/capped so a
            // quiet session can't produce an absurd multiplier.
            const beta = Math.max(0.5, Math.min(3.2, Math.abs(c.change24h) / btcMove || 1));
            const stress = exit.get(c.symbol)?.exitPressureScore ?? 50;
            const fragility = 1 + (stress - 50) / 200; // high exit pressure amplifies downside
            const est = btc_move_pct * beta * (btc_move_pct < 0 ? fragility : 2 - fragility);
            return {
              symbol: c.symbol,
              price: c.price,
              sensitivity: Number(beta.toFixed(2)),
              estimated_move_pct: Number(est.toFixed(1)),
              estimated_price: Number((c.price * (1 + est / 100)).toFixed(6)),
              exitPressure: stress,
              whalePhase: whale.get(c.symbol)?.phase ?? null,
            };
          })
          .filter(Boolean) as Record<string, unknown>[];

        const avg =
          rows.reduce((a, b) => a + (b['estimated_move_pct'] as number), 0) / Math.max(1, rows.length);
        return {
          scenario: `BTC ${pct(btc_move_pct)}`,
          basketEstimate: Number(avg.toFixed(1)),
          assets: rows,
          note: "Estimates from observed sensitivity and current fragility. Illustrative, not a prediction.",
        };
      },
    }),

    // Server-executed by Anthropic — grounds the coach in current events the
    // internal market snapshot can't explain (e.g. "why did BTC just drop").
    web_search: anthropic.tools.webSearch_20260209({
      maxUses: 3,
      blockedDomains: ["reddit.com"], // noisy relative to real news for this use case
    }),
  };

  const out: ToolSet = {};
  for (const [name, t] of Object.entries(all)) if (allowed.has(name)) out[name] = t;
  return out;
}

// ---------------------------------------------------------------------------
// Behaviour profiling
// ---------------------------------------------------------------------------

export interface CallRow {
  symbol: string;
  stance: "accumulate" | "reduce" | "watch" | "avoid";
  source: "coach" | "user";
  entry_price: number;
  move_pct: number | null;
  score: number | null;
  grade: string | null;
  verdict: string | null;
  status: string;
  regime_at_call: string | null;
  flux_at_call: number | null;
  created_at: string;
}

export interface BehaviorProfile {
  graded: number;
  open: number;
  hitRate: number | null;
  avgScore: number | null;
  discipline: number | null;
  patterns: { key: string; label: string; detail: string; severity: "info" | "warn" | "good" }[];
  summary: string | null;
}

export function computeBehavior(calls: CallRow[]): BehaviorProfile {
  const own = calls.filter((c) => c.source === "user");
  const graded = calls.filter((c) => c.status === "graded" && typeof c.score === "number");
  const open = calls.filter((c) => c.status === "open").length;

  const hits = graded.filter((c) => (c.score ?? 0) > 0).length;
  const hitRate = graded.length ? Math.round((hits / graded.length) * 100) : null;
  const avgScore = graded.length
    ? Number((graded.reduce((a, c) => a + (c.score ?? 0), 0) / graded.length).toFixed(2))
    : null;

  const patterns: BehaviorProfile["patterns"] = [];

  const chased = graded.filter((c) => c.stance === "accumulate" && (c.flux_at_call ?? 0) >= 70);
  const chasedBad = chased.filter((c) => (c.score ?? 0) < 0).length;
  if (chased.length >= 3 && chasedBad / chased.length > 0.5) {
    patterns.push({
      key: "chasing",
      label: "Chasing strength",
      detail: `${chasedBad} of ${chased.length} of your buys placed into an already-hot market went against you. Your best entries came earlier in the cycle.`,
      severity: "warn",
    });
  }

  const capitulated = graded.filter((c) => c.stance === "reduce" && (c.flux_at_call ?? 100) <= 35);
  const capBad = capitulated.filter((c) => (c.score ?? 0) < 0).length;
  if (capitulated.length >= 3 && capBad / capitulated.length > 0.5) {
    patterns.push({
      key: "capitulation",
      label: "Selling into weakness",
      detail: `You cut ${capBad} of ${capitulated.length} positions at depressed readings, and the market recovered afterwards.`,
      severity: "warn",
    });
  }

  const week = Date.now() - 7 * 864e5;
  const recent = own.filter((c) => new Date(c.created_at).getTime() > week).length;
  if (recent >= 15) {
    patterns.push({
      key: "overtrading",
      label: "High call frequency",
      detail: `${recent} calls in the last 7 days. Your graded results are usually better on weeks with fewer, higher-conviction calls.`,
      severity: "warn",
    });
  }

  const patient = graded.filter((c) => c.stance === "watch" || c.stance === "avoid");
  if (patient.length >= 3 && patient.filter((c) => (c.score ?? 0) > 0).length / patient.length > 0.6) {
    patterns.push({
      key: "patience",
      label: "Good at standing aside",
      detail: "Your 'watch' and 'avoid' calls age well — sitting out is one of your edges.",
      severity: "good",
    });
  }

  if (hitRate !== null && hitRate >= 60 && graded.length >= 5) {
    patterns.push({
      key: "consistency",
      label: "Consistent read",
      detail: `${hitRate}% of your graded calls landed on the right side of the move.`,
      severity: "good",
    });
  }

  // Discipline: reward accuracy, penalise overtrading and repeated warn patterns.
  let discipline: number | null = null;
  if (graded.length >= 3) {
    const warns = patterns.filter((p) => p.severity === "warn").length;
    discipline = Math.max(
      0,
      Math.min(100, Math.round((hitRate ?? 50) - warns * 12 - Math.max(0, recent - 10) * 1.5 + (avgScore ?? 0) * 2)),
    );
  }

  const summary = graded.length
    ? [
        `${graded.length} graded calls, ${hitRate}% on the right side`,
        discipline !== null ? `discipline score ${discipline}/100` : null,
        ...patterns.map((p) => p.label.toLowerCase()),
      ]
        .filter(Boolean)
        .join("; ")
    : null;

  return { graded: graded.length, open, hitRate, avgScore, discipline, patterns, summary };
}

// ---------------------------------------------------------------------------
// Call grading (run from the cron evaluator)
// ---------------------------------------------------------------------------

function letter(score: number) {
  if (score >= 8) return "A";
  if (score >= 3) return "B";
  if (score >= -1) return "C";
  if (score >= -6) return "D";
  return "F";
}

/** Grade every open call whose horizon has elapsed against the live price map. */
export async function gradeDueCalls(
  admin: Admin,
  priceBySymbol: Record<string, { price: number; change24h: number }>,
): Promise<number> {
  const { data } = await admin
    .from("coach_calls")
    .select("id,symbol,stance,entry_price,horizon_hours,created_at")
    .eq("status", "open")
    .limit(500);
  const rows = (data ?? []) as {
    id: string;
    symbol: string;
    stance: string;
    entry_price: number;
    horizon_hours: number;
    created_at: string;
  }[];
  const now = Date.now();
  let graded = 0;

  for (const c of rows) {
    const due = new Date(c.created_at).getTime() + c.horizon_hours * 3600_000;
    if (now < due) continue;
    const cur = priceBySymbol[c.symbol]?.price;
    if (!cur || !c.entry_price) continue;

    const move = ((cur - c.entry_price) / c.entry_price) * 100;
    const score =
      c.stance === "accumulate" ? move : c.stance === "reduce" || c.stance === "avoid" ? -move : -Math.abs(move) / 2;
    const grade = letter(score);
    const verdict =
      score >= 3
        ? `Right call — ${c.symbol} moved ${move >= 0 ? "+" : ""}${move.toFixed(1)}% over the horizon.`
        : score <= -3
          ? `Wrong side — ${c.symbol} moved ${move >= 0 ? "+" : ""}${move.toFixed(1)}% against the call.`
          : `Flat — ${c.symbol} moved ${move >= 0 ? "+" : ""}${move.toFixed(1)}%, no real edge either way.`;

    await admin
      .from("coach_calls")
      .update({
        status: "graded",
        exit_price: cur,
        move_pct: Number(move.toFixed(3)),
        score: Number(score.toFixed(3)),
        grade,
        verdict,
        graded_at: new Date(now).toISOString(),
      })
      .eq("id", c.id);
    graded++;
  }
  return graded;
}
