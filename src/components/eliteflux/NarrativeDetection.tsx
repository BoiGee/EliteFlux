import { Sparkles, TrendingUp, ArrowUpRight } from "lucide-react";
import { useEliteIntel } from "@/lib/market";

const accelColor = {
  rising: "bull",
  stable: "neon-cyan",
  fading: "bear",
} as const;

export function NarrativeDetection() {
  const { narrative } = useEliteIntel();

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Narrative Detection Engine · v3
            </p>
            <h3 className="text-base font-bold tracking-tight">Emerging themes before mainstream</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aggregate</div>
          <div className="text-xl font-bold text-gradient">{narrative.aggregateStrength}</div>
        </div>
      </div>

      {narrative.topEmerging.length > 0 && (
        <div className="glass-panel p-3 mb-3 border-l-2" style={{ borderLeftColor: "var(--bull)" }}>
          <div className="flex items-center gap-2 mb-1.5">
            <ArrowUpRight className="w-3.5 h-3.5" style={{ color: "var(--bull)" }} />
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--bull)" }}>
              Emerging — early signal
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {narrative.topEmerging.map((n) => (
              <span
                key={n.id}
                className="text-xs px-2 py-1 rounded font-medium"
                style={{ background: "color-mix(in oklab, var(--bull) 18%, transparent)", color: "var(--bull)" }}
              >
                {n.label} · {n.strength}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {narrative.detected.length === 0 ? (
          <p className="text-xs text-muted-foreground">Building narrative correlations…</p>
        ) : (
          narrative.detected.map((n) => {
            const col = accelColor[n.acceleration];
            return (
              <div key={n.id} className="glass-panel p-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md grid place-items-center shrink-0"
                  style={{ background: `color-mix(in oklab, var(--${col}) 18%, transparent)` }}
                >
                  <TrendingUp className="w-4 h-4" style={{ color: `var(--${col})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{n.label}</span>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: `color-mix(in oklab, var(--${col}) 18%, transparent)`,
                        color: `var(--${col})`,
                      }}
                    >
                      {n.acceleration}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.thesis}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                    <span>Strength <span className="text-foreground font-semibold">{n.strength}</span></span>
                    <span>Corr <span className="text-foreground font-semibold">{(n.correlation * 100).toFixed(0)}%</span></span>
                    <span>Vol <span className="text-foreground font-semibold">×{n.volumeSurge.toFixed(2)}</span></span>
                    <span className="truncate">{n.assets.slice(0, 4).join(" · ")}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Rotation velocity</span>
        <span className="font-semibold text-foreground">{narrative.rotationVelocity}</span>
      </div>
    </section>
  );
}
