import { Flame, Zap } from "lucide-react";
import { useEliteIntel } from "@/lib/market";
import type { IgnitionStage } from "@/lib/momentum-ignition";

const stageColor: Record<IgnitionStage, string> = {
  Dormant: "muted-foreground",
  "Speculative Accumulation": "neon-cyan",
  "Pre-Breakout Conditions": "warn",
  "Early Momentum Detected": "neon-purple",
  "Active Breakout": "bull",
};

export function MomentumIgnition() {
  const { ignition } = useEliteIntel();

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Early Momentum Ignition Engine
            </p>
            <h3 className="text-base font-bold tracking-tight">Pre-breakout & accumulation signals</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ignition</div>
          <div className="text-xl font-bold text-gradient">{ignition.ignitionScore}</div>
          <div className="text-[10px] text-muted-foreground">Sector sync {ignition.sectorSync}%</div>
        </div>
      </div>

      {ignition.signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">Scanning compression / expansion patterns…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ignition.signals.slice(0, 8).map((s) => {
            const col = stageColor[s.stage];
            return (
              <div
                key={s.symbol}
                className="glass-panel p-2.5 border-l-2"
                style={{ borderLeftColor: `var(--${col})` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5" style={{ color: `var(--${col})` }} />
                    <span className="text-sm font-bold">{s.symbol}</span>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                    style={{
                      background: `color-mix(in oklab, var(--${col}) 18%, transparent)`,
                      color: `var(--${col})`,
                    }}
                  >
                    {s.stage}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.reason}</p>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>Score <span className="text-foreground font-semibold">{s.score}</span></span>
                  <span>Vol ×{s.volumeBuild.toFixed(2)}</span>
                  <span>Compress {(s.volatilityCompression * 100).toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
