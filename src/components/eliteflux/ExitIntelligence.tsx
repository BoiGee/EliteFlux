import { AlertTriangle, ArrowDownRight, Gauge, ShieldAlert, TrendingDown } from "lucide-react";
import { useEliteIntel } from "@/lib/market";
import type { ExitBand, ExitAssetSignal } from "@/lib/exit-intel";

const bandTone: Record<ExitBand, string> = {
  "Strong Hold": "bull",
  Caution: "warn",
  "Reduce Exposure": "warn",
  "High Exit Pressure": "bear",
};

const phaseTone: Record<string, string> = {
  Accumulation: "bull",
  Expansion: "neon-cyan",
  Distribution: "warn",
  Exhaustion: "bear",
};

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${value}%`, background: `var(--${color})`, boxShadow: `0 0 10px var(--${color})` }}
      />
    </div>
  );
}

function AssetRow({ a }: { a: ExitAssetSignal }) {
  const c = bandTone[a.band];
  const p = phaseTone[a.phase];
  return (
    <div className="glass-panel p-3 flex flex-col gap-2 hover:bg-surface/40 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-md grid place-items-center text-xs font-bold shrink-0"
          style={{
            background: `color-mix(in oklab, var(--${c}) 18%, transparent)`,
            color: `var(--${c})`,
          }}
        >
          {a.symbol.slice(0, 3)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold truncate">{a.name}</p>
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: `color-mix(in oklab, var(--${p}) 14%, transparent)`, color: `var(--${p})` }}
            >
              {a.phase}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{a.rationale}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold leading-none" style={{ color: `var(--${c})` }}>
            {a.exitPressureScore}
          </div>
          <p className="text-[10px] text-muted-foreground">/100</p>
        </div>
      </div>
      <Bar value={a.exitPressureScore} color={c} />
      <div className="flex flex-wrap gap-1.5">
        <span
          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: `color-mix(in oklab, var(--${c}) 14%, transparent)`, color: `var(--${c})` }}
        >
          {a.band}
        </span>
        <span
          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            background: `color-mix(in oklab, var(--${a.risk === "High" ? "bear" : a.risk === "Medium" ? "warn" : "bull"}) 14%, transparent)`,
            color: `var(--${a.risk === "High" ? "bear" : a.risk === "Medium" ? "warn" : "bull"})`,
          }}
        >
          {a.risk} risk
        </span>
        {a.tags.map((t) => (
          <span
            key={t}
            className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2/60 text-foreground/80"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground italic">{a.reversalWindow}</p>
    </div>
  );
}

export function ExitIntelligence() {
  const { exit } = useEliteIntel();
  const c = bandTone[exit.marketBand];
  const p = phaseTone[exit.marketPhase];

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg grid place-items-center bg-gradient-bear">
            <TrendingDown className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Exit Intelligence Engine
            </p>
            <h3 className="text-base font-bold tracking-tight">
              Probabilistic Risk &amp; Distribution Detection
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
          <span
            className="px-2 py-1 rounded"
            style={{ background: `color-mix(in oklab, var(--${p}) 18%, transparent)`, color: `var(--${p})` }}
          >
            {exit.marketPhase} phase
          </span>
          <span
            className="px-2 py-1 rounded"
            style={{ background: `color-mix(in oklab, var(--${c}) 18%, transparent)`, color: `var(--${c})` }}
          >
            {exit.marketBand}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        <div className="space-y-3">
          <div className="glass-panel p-4 flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Gauge className="w-3 h-3" /> Market Exit Pressure
            </div>
            <div className="text-5xl font-bold mt-1" style={{ color: `var(--${c})` }}>
              {exit.marketExitPressure}
            </div>
            <div className="text-[10px] text-muted-foreground mb-2">/100</div>
            <div className="w-full">
              <Bar value={exit.marketExitPressure} color={c} />
            </div>
            <p className="text-[11px] text-muted-foreground italic mt-3 text-center">
              {exit.reversalWindow}
            </p>
          </div>

          <div className="glass-panel p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <ShieldAlert className="w-3 h-3" /> System messages
            </div>
            {exit.systemMessages.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No elevated distribution signals.</p>
            ) : (
              exit.systemMessages.map((m) => (
                <div key={m} className="flex items-center gap-2 text-[11px]">
                  <AlertTriangle className="w-3 h-3 text-warn shrink-0" />
                  <span className="text-foreground/90">{m}</span>
                </div>
              ))
            )}
          </div>

          <div className="glass-panel p-3 text-[10px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground/80">Note:</strong> Probabilistic market risk
            detection — not financial advice and not exact exit timing. Use as a position
            risk-awareness layer.
          </div>

          <div className="glass-panel p-3 space-y-1.5 text-[10px]">
            <p className="uppercase tracking-wider text-muted-foreground mb-1">Score bands</p>
            <p><span className="text-bull font-semibold">0–30</span> Strong hold</p>
            <p><span className="text-warn font-semibold">31–60</span> Caution</p>
            <p><span className="text-warn font-semibold">61–80</span> Reduce exposure</p>
            <p><span className="text-bear font-semibold">81–100</span> High exit pressure</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Per-asset exit pressure
          </p>
          {exit.assets.length === 0 ? (
            <div className="glass-panel p-4 text-xs text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="w-3.5 h-3.5" />
              No elevated exit pressure detected — markets in hold zone.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {exit.assets.slice(0, 10).map((a) => (
                <AssetRow key={a.symbol} a={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
