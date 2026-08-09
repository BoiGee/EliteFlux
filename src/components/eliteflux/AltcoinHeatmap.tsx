import { ArrowDown, ArrowUp, Minus, TrendingUp } from "lucide-react";
import { useLiveMarket } from "@/lib/market";

const riskColor = { Low: "text-bull bg-bull/10 border-bull/30", Medium: "text-warn bg-warn/10 border-warn/30", High: "text-bear bg-bear/10 border-bear/30" };

export function AltcoinHeatmap() {
  const { snapshot } = useLiveMarket();
  const categoryFlows = snapshot.categoryFlows;
  return (
    <section className="glass-card p-6 animate-rise">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neon-blue" />
            Altcoin Flow Heatmap
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Capital rotation across asset categories</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md bg-primary/15 text-primary border border-primary/30">
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-glow" />
          Live · 24H
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {categoryFlows.map((c, i) => {
          const TrendIcon = c.trend === "up" ? ArrowUp : c.trend === "down" ? ArrowDown : Minus;
          const trendCol = c.trend === "up" ? "text-bull" : c.trend === "down" ? "text-bear" : "text-muted-foreground";
          return (
            <div
              key={c.id}
              className="relative overflow-hidden glass-panel p-4 group hover:border-primary/40 transition-all hover:-translate-y-0.5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div
                className="absolute inset-0 opacity-30 blur-2xl pointer-events-none"
                style={{
                  background: c.flow === "inflow"
                    ? `radial-gradient(circle at 50% 0%, var(--bull), transparent 70%)`
                    : `radial-gradient(circle at 50% 0%, var(--bear), transparent 70%)`,
                }}
              />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${riskColor[c.risk]}`}>
                    {c.risk}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <p className="text-3xl font-bold tracking-tight">{c.momentum}</p>
                  <span className={`text-xs flex items-center gap-0.5 ${trendCol}`}>
                    <TrendIcon className="w-3 h-3" />
                    {Math.abs(c.change24h).toFixed(1)}%
                  </span>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Momentum</p>

                <div className="mt-3 h-1.5 rounded-full bg-surface overflow-hidden">
                  <div className="h-full bg-gradient-cyber" style={{ width: `${c.momentum}%` }} />
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className={`flex items-center gap-1 font-medium ${c.flow === "inflow" ? "text-bull" : "text-bear"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-glow" />
                    {c.flow === "inflow" ? "Inflow" : "Outflow"}
                  </span>
                  <span className="text-muted-foreground">{c.marketShare}% share</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
