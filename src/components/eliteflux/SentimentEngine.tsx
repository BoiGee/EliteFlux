import { Brain, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useEliteIntel } from "@/lib/market";

const stateTone: Record<string, string> = {
  Bullish: "bull",
  Bearish: "bear",
  Neutral: "warn",
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="text-foreground font-semibold">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-primary"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function SentimentEngine() {
  const { sentiment } = useEliteIntel();
  const col = stateTone[sentiment.state];
  const TrendIcon =
    sentiment.trend === "Rising" ? TrendingUp : sentiment.trend === "Falling" ? TrendingDown : Minus;

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg grid place-items-center"
            style={{ background: `color-mix(in oklab, var(--${col}) 22%, transparent)` }}
          >
            <Brain className="w-4 h-4" style={{ color: `var(--${col})` }} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Sentiment Intelligence
            </p>
            <h3 className="text-base font-bold tracking-tight">Market Psychology Inference</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
          <span
            className="px-2 py-1 rounded"
            style={{
              background: `color-mix(in oklab, var(--${col}) 18%, transparent)`,
              color: `var(--${col})`,
            }}
          >
            {sentiment.state}
          </span>
          <span className="px-2 py-1 rounded bg-surface/60 text-muted-foreground flex items-center gap-1">
            <TrendIcon className="w-3 h-3" />
            {sentiment.trend}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-center">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sentiment</p>
          <div className="text-5xl font-bold mt-1" style={{ color: `var(--${col})` }}>
            {sentiment.score}
          </div>
          <p className="text-[10px] text-muted-foreground">/100</p>
          <div className="w-full h-1.5 rounded-full bg-surface mt-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${sentiment.score}%`,
                background: `var(--${col})`,
                boxShadow: `0 0 14px var(--${col})`,
              }}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
            Live market psychology read across the tracked universe.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Bar label="Price acceleration" value={sentiment.components.priceAcceleration} />
          <Bar label="Volume expansion" value={sentiment.components.volumeExpansion} />
          <Bar label="Volatility health" value={sentiment.components.volatilitySpike} />
          <Bar label="Momentum consistency" value={sentiment.components.momentumConsistency} />
        </div>
      </div>
    </section>
  );
}
