import { AlertOctagon, Bell, Radio } from "lucide-react";
import { useEliteIntel } from "@/lib/market";

const severityTone: Record<string, string> = {
  critical: "bear",
  warning: "warn",
  info: "neon-cyan",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventSignals() {
  const { events } = useEliteIntel();

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Radio className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Event Signal System
            </p>
            <h3 className="text-base font-bold tracking-tight">Real-time Regime &amp; Score Alerts</h3>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-surface/60 text-muted-foreground">
          {events.length} signals
        </span>
      </div>

      {events.length === 0 ? (
        <div className="glass-panel p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" />
          Monitoring market state — no transitions detected yet.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {events.map((e) => {
            const col = severityTone[e.severity];
            return (
              <div
                key={e.id}
                className="glass-panel p-2.5 flex items-start gap-3 border-l-2"
                style={{ borderLeftColor: `var(--${col})` }}
              >
                <div
                  className="w-7 h-7 rounded-md grid place-items-center shrink-0"
                  style={{ background: `color-mix(in oklab, var(--${col}) 18%, transparent)` }}
                >
                  <AlertOctagon className="w-3.5 h-3.5" style={{ color: `var(--${col})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: `var(--${col})` }}
                    >
                      {e.tag}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(e.timestamp)}</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 leading-snug">{e.explanation}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
