import { Users, Layers } from "lucide-react";
import { useEliteIntel } from "@/lib/market";

const klassColor: Record<string, string> = {
  "Institutional Accumulation Cluster": "bull",
  "Whale Distribution Cluster": "bear",
  "Mixed Flow / Uncertain": "warn",
};

export function SmartMoneyCluster() {
  const { smartMoney } = useEliteIntel();
  const col = klassColor[smartMoney.dominantClass] ?? "neon-cyan";

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Users className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Smart Money Clustering · v3
            </p>
            <h3 className="text-base font-bold tracking-tight">Coordinated whale behavior</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</div>
          <div className="text-xl font-bold" style={{ color: `var(--${col})` }}>
            {smartMoney.confidenceScore}
          </div>
        </div>
      </div>

      <div
        className="glass-panel p-3 mb-3 border-l-2"
        style={{ borderLeftColor: `var(--${col})` }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: `var(--${col})` }}
          >
            {smartMoney.dominantClass}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Coordination {smartMoney.coordinationIndex}%
          </span>
        </div>
      </div>

      {smartMoney.clusters.length === 0 ? (
        <p className="text-xs text-muted-foreground">No whale clusters formed in current window.</p>
      ) : (
        <div className="space-y-2">
          {smartMoney.clusters.map((c) => {
            const cc = klassColor[c.klass] ?? "neon-cyan";
            return (
              <div key={c.id} className="glass-panel p-3 flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-md grid place-items-center shrink-0"
                  style={{ background: `color-mix(in oklab, var(--${cc}) 18%, transparent)` }}
                >
                  <Layers className="w-4 h-4" style={{ color: `var(--${cc})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{c.klass}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: `color-mix(in oklab, var(--${cc}) 18%, transparent)`,
                        color: `var(--${cc})`,
                      }}
                    >
                      conf {c.confidence}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{c.rationale}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.assets.map((a) => (
                      <span
                        key={a}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-surface/60 text-muted-foreground"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
