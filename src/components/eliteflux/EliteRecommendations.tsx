import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase, Crown, Scale, Sparkles, ThumbsDown, ThumbsUp, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { useEliteIntel } from "@/lib/market";
import { submitFeedback } from "@/lib/coach.functions";
import { getSuggestedSizing } from "@/lib/sizing.functions";
import { listConnections } from "@/lib/portfolio.functions";
import { annotateWithPortfolio, type PortfolioHolding } from "@/lib/portfolio-context";
import type { EliteOpportunity, MarketStance } from "@/lib/recommendation-engine";

const STANCE_TONE: Record<MarketStance, string> = {
  "Accumulation Phase": "neon-cyan",
  "Early Expansion Phase": "neon-blue",
  "Momentum Phase": "bull",
  "Distribution Phase": "bear",
  "High Risk / Unstable Phase": "warn",
};

const BAND_TONE: Record<EliteOpportunity["band"], string> = {
  Weak: "bear",
  Neutral: "muted-foreground",
  "Strong Early": "neon-cyan",
  "High Conviction": "bull",
};

function fmt(n: number) {
  if (n < 0.001) return n.toFixed(7);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString();
}

function TrendIcon({ t }: { t: EliteOpportunity["trend"] }) {
  if (t === "up") return <ArrowUpRight className="w-3.5 h-3.5 text-bull" />;
  if (t === "down") return <ArrowDownRight className="w-3.5 h-3.5 text-bear" />;
  return <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />;
}

function Row({ o, rank, portfolioNote }: { o: EliteOpportunity; rank: number; portfolioNote?: string | null }) {
  const stanceTone = STANCE_TONE[o.stance];
  const bandTone = BAND_TONE[o.band];
  const isTop3 = rank <= 3;

  const submit = useServerFn(submitFeedback);
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const feedbackM = useMutation({
    mutationFn: (rating: "up" | "down") =>
      submit({ data: { subjectType: "opportunity", subjectId: o.symbol, rating } }),
  });
  const rate = (rating: "up" | "down") => {
    setRated(rating);
    feedbackM.mutate(rating);
  };

  const sizeFn = useServerFn(getSuggestedSizing);
  const [showSizing, setShowSizing] = useState(false);
  const sizingM = useMutation({ mutationFn: () => sizeFn({ data: { score: o.score } }) });
  const toggleSizing = () => {
    const next = !showSizing;
    setShowSizing(next);
    if (next && !sizingM.data && !sizingM.isPending) sizingM.mutate();
  };

  return (
    <div
      className={`glass-panel p-3 grid grid-cols-[28px_1fr_auto] gap-3 items-center transition ${
        isTop3 ? "border-l-2" : ""
      }`}
      style={isTop3 ? { borderLeftColor: `var(--bull)` } : undefined}
    >
      <div className="flex items-center justify-center">
        {rank === 1 ? (
          <Crown className="w-4 h-4 text-warn" />
        ) : (
          <span className={`text-xs font-bold font-mono ${isTop3 ? "text-bull" : "text-muted-foreground"}`}>
            #{rank}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold tracking-tight">{o.symbol}</span>
          <span className="text-[11px] text-muted-foreground truncate">{o.name}</span>
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color: `var(--${stanceTone})`,
              background: `color-mix(in oklab, var(--${stanceTone}) 14%, transparent)`,
            }}
          >
            {o.stance.replace(" Phase", "")}
          </span>
          {o.isHighRisk && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-warn/15 text-warn flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> High Risk
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">${fmt(o.price)}</span>
          <span className={`flex items-center gap-0.5 ${o.change24h >= 0 ? "text-bull" : "text-bear"}`}>
            <TrendIcon t={o.trend} />
            {o.change24h >= 0 ? "+" : ""}{o.change24h.toFixed(2)}%
          </span>
          {o.reasonTags.slice(0, 2).map((t) => (
            <span key={t} className="hidden md:inline text-[10px] uppercase tracking-wider opacity-70">
              · {t}
            </span>
          ))}
        </div>
        {portfolioNote && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-neon-cyan/90">
            <Briefcase className="w-2.5 h-2.5 shrink-0" />
            <span>{portfolioNote}</span>
          </div>
        )}
      </div>

      <div className="text-right min-w-[88px]">
        <div className="flex items-baseline justify-end gap-1">
          <span className="text-xl font-bold font-mono" style={{ color: `var(--${bandTone})` }}>
            {o.score}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
        <div className="text-[9px] uppercase tracking-wider" style={{ color: `var(--${bandTone})` }}>
          {o.band}
        </div>
        <div className="mt-1 h-1 w-20 rounded-full bg-surface overflow-hidden ml-auto">
          <div className="h-full" style={{ width: `${o.score}%`, background: `var(--${bandTone})` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-1">
          <button
            onClick={toggleSizing}
            aria-label="Suggested position size"
            className={`p-0.5 rounded hover:bg-surface-2 transition ${showSizing ? "text-neon-cyan" : "text-muted-foreground/50"}`}
          >
            <Scale className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => rate("up")}
            aria-label="Good call"
            className={`p-0.5 rounded hover:bg-surface-2 transition ${rated === "up" ? "text-bull" : "text-muted-foreground/50"}`}
          >
            <ThumbsUp className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => rate("down")}
            aria-label="Bad call"
            className={`p-0.5 rounded hover:bg-surface-2 transition ${rated === "down" ? "text-bear" : "text-muted-foreground/50"}`}
          >
            <ThumbsDown className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {showSizing && (
        <div className="col-span-3 -mt-1 pt-2 border-t border-border/40 text-[11px]">
          {sizingM.isPending && <span className="text-muted-foreground">Computing from measured history…</span>}
          {sizingM.data && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-bold ${sizingM.data.edge === "positive" ? "text-bull" : sizingM.data.edge === "negative" ? "text-bear" : "text-muted-foreground"}`}
                >
                  {sizingM.data.suggestedSizePct > 0 ? `Suggested: up to ${sizingM.data.suggestedSizePct}% of capital` : "No sizing edge"}
                </span>
                <span className="text-muted-foreground">
                  · {Math.round(sizingM.data.hitProbability * 100)}% measured hit rate · n={sizingM.data.sampleSize}
                </span>
              </div>
              <p className="text-muted-foreground">{sizingM.data.rationale}</p>
              {sizingM.data.personal && (
                <p className="text-neon-cyan/80 pt-1 border-t border-border/30">
                  {sizingM.data.personal.note}
                  {sizingM.data.personal.winRate !== null &&
                    ` Avg win ${sizingM.data.personal.avgWinPct}% vs avg loss ${sizingM.data.personal.avgLossPct}%.`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EliteRecommendations() {
  const { recommendations, recommendationAlerts } = useEliteIntel();
  const { opportunities, global } = recommendations;
  const top10 = opportunities.slice(0, 10);
  const recentAlerts = recommendationAlerts.slice(0, 4);

  const { user } = useAuth();
  const fetchPortfolio = useServerFn(listConnections);
  const portfolioQ = useQuery({
    queryKey: ["portfolio", "for-recommendations"],
    queryFn: () => fetchPortfolio(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const portfolioCtx = useMemo(
    () => annotateWithPortfolio(top10, (portfolioQ.data?.holdings ?? []) as PortfolioHolding[]),
    [top10, portfolioQ.data],
  );

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Trophy className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Elite Recommendation Engine
            </p>
            <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
              Top Opportunities
              <Sparkles className="w-3.5 h-3.5 text-neon-cyan" />
            </h3>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">
          AI-driven probability ranking · not financial advice
        </span>
      </div>

      {/* Global summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="glass-panel p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Regime</p>
          <p className="text-sm font-bold mt-0.5">{global.regime}</p>
        </div>
        <div className="glass-panel p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">BTC Dominance</p>
          <p className="text-sm font-bold mt-0.5">{global.btcDominanceState}</p>
        </div>
        <div className="glass-panel p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sentiment</p>
          <p
            className="text-sm font-bold mt-0.5"
            style={{
              color:
                global.sentimentState === "Bullish"
                  ? "var(--bull)"
                  : global.sentimentState === "Bearish"
                    ? "var(--bear)"
                    : undefined,
            }}
          >
            {global.sentimentState}
          </p>
        </div>
        <div className="glass-panel p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Liquidity Flow</p>
          <p className="text-sm font-bold mt-0.5">{global.liquidityFlow}</p>
        </div>
      </div>

      {portfolioCtx.concentrationWarning && (
        <div className="glass-panel p-2.5 mb-3 border-l-2 border-warn flex items-center gap-2 text-[11px]">
          <Briefcase className="w-3.5 h-3.5 text-warn shrink-0" />
          <span>{portfolioCtx.concentrationWarning}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-1.5">
          {top10.length === 0 ? (
            <div className="glass-panel p-4 text-xs text-muted-foreground">
              Aggregating intelligence layers — ranking populates as live data flows in.
            </div>
          ) : (
            portfolioCtx.opportunities.map((o, i) => <Row key={o.symbol} o={o} rank={i + 1} portfolioNote={o.portfolioNote} />)
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
            Ranking Alerts
          </p>
          {recentAlerts.length === 0 ? (
            <div className="glass-panel p-3 text-[11px] text-muted-foreground">
              Watching for ranking shifts…
            </div>
          ) : (
            recentAlerts.map((a) => {
              const tone = a.severity === "warning" ? "warn" : a.severity === "critical" ? "bear" : "neon-cyan";
              return (
                <div
                  key={a.id}
                  className="glass-panel p-2.5 border-l-2"
                  style={{ borderLeftColor: `var(--${tone})` }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: `var(--${tone})` }}
                    >
                      {a.reasonTag}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(a.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5 leading-snug">{a.message}</p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
