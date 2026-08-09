import { Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useLiveMarket } from "@/lib/market";

const dirMap = {
  rising: { icon: TrendingUp, col: "text-bull", label: "Rising" },
  fading: { icon: TrendingDown, col: "text-bear", label: "Fading" },
  stable: { icon: Minus, col: "text-muted-foreground", label: "Stable" },
} as const;

export function NarrativeEngine() {
  const { snapshot } = useLiveMarket();
  const narratives = snapshot.narratives;
  return (
    <section className="glass-card p-6 animate-rise">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-neon-purple" />
            Narrative Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Active themes capturing market attention</p>
        </div>
      </div>

      <div className="space-y-3">
        {narratives
          .slice()
          .sort((a, b) => b.strength - a.strength)
          .map((n) => {
            const D = dirMap[n.direction];
            return (
              <div key={n.id} className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{n.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border border-current/30 flex items-center gap-0.5 ${D.col}`}>
                      <D.icon className="w-2.5 h-2.5" />
                      {D.label}
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{n.strength}</span>
                </div>
                <div className="relative h-2 rounded-full bg-surface overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-cyber rounded-full transition-all"
                    style={{ width: `${n.strength}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full blur-md opacity-60"
                    style={{ width: `${n.strength}%`, background: "var(--gradient-cyber)" }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-muted-foreground">{n.description}</p>
                  <div className="flex gap-1">
                    {n.topCoins.map((c) => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted-foreground font-mono">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
