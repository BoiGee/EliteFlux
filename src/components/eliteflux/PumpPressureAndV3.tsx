import { Gauge, Cpu } from "lucide-react";
import { useEliteIntel } from "@/lib/market";
import type { PressureBand } from "@/lib/pump-pressure";
import type { RegimeV3 } from "@/lib/elite-brain-v3";

const bandColor: Record<PressureBand, string> = {
  Low: "muted-foreground",
  Moderate: "neon-cyan",
  High: "warn",
  Extreme: "bull",
};

const regimeColor: Record<RegimeV3, string> = {
  "Risk-Off De-risking Phase": "bear",
  "Accumulation Phase (Smart Money Entry)": "neon-cyan",
  "Early Expansion Phase": "neon-purple",
  "Altcoin Rotation Phase": "bull",
  "Meme Speculation Phase": "warn",
  "Distribution / Exit Phase": "bear",
};

export function PumpPressureAndV3() {
  const { pressure, brainV3 } = useEliteIntel();
  const pCol = bandColor[pressure.band];
  const rCol = regimeColor[brainV3.regime];

  const bars: Array<[string, number]> = [
    ["Liquidity", pressure.contributors.liquidityInflow],
    ["Sentiment", pressure.contributors.sentimentAccel],
    ["Volume", pressure.contributors.volumeExpansion],
    ["Narrative", pressure.contributors.narrativeStrength],
    ["Whale align", pressure.contributors.whaleAlignment],
    ["Ignition", pressure.contributors.momentumIgnition],
  ];

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Cpu className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Elite Brain AI · v3 Cognition
            </p>
            <h3 className="text-base font-bold tracking-tight">Pressure & adaptive regime</h3>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cognition</div>
          <div className="text-2xl font-bold text-gradient">{brainV3.cognitionScore}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Pressure */}
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5" style={{ color: `var(--${pCol})` }} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pump Pressure
              </span>
            </div>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded"
              style={{
                background: `color-mix(in oklab, var(--${pCol}) 18%, transparent)`,
                color: `var(--${pCol})`,
              }}
            >
              {pressure.band}
            </span>
          </div>
          <div className="text-3xl font-bold mb-1" style={{ color: `var(--${pCol})` }}>
            {pressure.score}
            <span className="text-xs text-muted-foreground font-normal">/100</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3 leading-snug">{pressure.rationale}</p>
          <div className="space-y-1.5">
            {bars.map(([label, v]) => (
              <div key={label}>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>{label}</span>
                  <span className="font-semibold text-foreground">{v}</span>
                </div>
                <div className="h-1 rounded bg-surface/60 overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, v))}%`,
                      background: "var(--gradient-cyber)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Regime V3 */}
        <div className="glass-panel p-4 border-l-2" style={{ borderLeftColor: `var(--${rCol})` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Adaptive Regime
            </span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded"
              style={{
                background: `color-mix(in oklab, var(--${rCol}) 18%, transparent)`,
                color: `var(--${rCol})`,
              }}
            >
              conf {brainV3.confidence}
            </span>
          </div>
          <div className="text-base font-bold leading-tight mb-1" style={{ color: `var(--${rCol})` }}>
            {brainV3.regime}
          </div>
          {brainV3.transition && (
            <p className="text-[11px] text-muted-foreground mb-2">
              Transition · {brainV3.transition.from} → {brainV3.transition.to}
            </p>
          )}
          <div className="mt-2 space-y-1">
            {brainV3.signals.map((s) => (
              <div
                key={s}
                className="text-[11px] text-foreground/90 flex items-start gap-1.5"
              >
                <span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: `var(--${rCol})` }} />
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {Object.entries(brainV3.vector).map(([k, v]) => (
              <div key={k} className="rounded bg-surface/40 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="text-sm font-bold">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
