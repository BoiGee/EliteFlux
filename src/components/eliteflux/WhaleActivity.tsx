import { Anchor, ArrowDownRight, ArrowUpRight, Waves } from "lucide-react";
import { useEliteIntel } from "@/lib/market";

const phaseTone: Record<string, string> = {
  Accumulation: "bull",
  Distribution: "bear",
  Neutral: "warn",
};
const impactTone: Record<string, string> = {
  High: "bear",
  Medium: "warn",
  Low: "neon-cyan",
};

export function WhaleActivity() {
  const { whale } = useEliteIntel();
  const phaseCol = phaseTone[whale.phase];
  const impactCol = impactTone[whale.impact];

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg grid place-items-center"
            style={{ background: `color-mix(in oklab, var(--${phaseCol}) 22%, transparent)` }}
          >
            <Anchor className="w-4 h-4" style={{ color: `var(--${phaseCol})` }} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Whale Activity Intelligence
            </p>
            <h3 className="text-base font-bold tracking-tight">Smart Money Flow Detection</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
          <span
            className="px-2 py-1 rounded"
            style={{
              background: `color-mix(in oklab, var(--${phaseCol}) 18%, transparent)`,
              color: `var(--${phaseCol})`,
            }}
          >
            {whale.phase}
          </span>
          <span
            className="px-2 py-1 rounded"
            style={{
              background: `color-mix(in oklab, var(--${impactCol}) 18%, transparent)`,
              color: `var(--${impactCol})`,
            }}
          >
            {whale.impact} impact
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5">
        <div className="glass-panel p-4 flex flex-col items-center justify-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Whale Score</p>
          <div className="text-5xl font-bold mt-1" style={{ color: `var(--${phaseCol})` }}>
            {whale.score}
          </div>
          <div className="text-[10px] text-muted-foreground">/100</div>
          <div className="w-full h-1.5 rounded-full bg-surface mt-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${whale.score}%`,
                background: `var(--${phaseCol})`,
                boxShadow: `0 0 14px var(--${phaseCol})`,
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 w-full text-center">
            <div className="rounded bg-surface/60 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Accum</p>
              <p className="text-sm font-bold text-bull">{whale.accumulating}</p>
            </div>
            <div className="rounded bg-surface/60 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Distrib</p>
              <p className="text-sm font-bold text-bear">{whale.distributing}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Top whale signals
          </p>
          {whale.topSignals.length === 0 ? (
            <div className="glass-panel p-4 text-xs text-muted-foreground flex items-center gap-2">
              <Waves className="w-3.5 h-3.5" />
              Collecting baseline — abnormal flow detection warming up.
            </div>
          ) : (
            <div className="space-y-1.5">
              {whale.topSignals.map((s) => {
                const c = phaseTone[s.phase];
                const Arrow = s.priceImpact >= 0 ? ArrowUpRight : ArrowDownRight;
                return (
                  <div
                    key={s.symbol}
                    className="glass-panel p-2.5 flex items-center gap-3 hover:bg-surface/40 transition-colors"
                  >
                    <div
                      className="w-9 h-9 rounded-md grid place-items-center text-xs font-bold"
                      style={{
                        background: `color-mix(in oklab, var(--${c}) 18%, transparent)`,
                        color: `var(--${c})`,
                      }}
                    >
                      {s.symbol.slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold truncate">{s.name}</p>
                        <span
                          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background: `color-mix(in oklab, var(--${c}) 14%, transparent)`,
                            color: `var(--${c})`,
                          }}
                        >
                          {s.phase}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{s.reason}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 justify-end text-xs font-semibold" style={{ color: `var(--${c})` }}>
                        <Arrow className="w-3 h-3" />
                        {s.score}
                      </div>
                      <p className="text-[10px] text-muted-foreground">vol ×{s.volumeSpike}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
