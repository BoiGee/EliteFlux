import { AlertTriangle, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { useLiveMarket } from "@/lib/market";

const tagStyle: Record<string, string> = {
  "Hype-driven": "text-neon-pink bg-neon-pink/10 border-neon-pink/30",
  "Whale-controlled": "text-neon-purple bg-neon-purple/10 border-neon-purple/30",
  "High volatility": "text-bear bg-bear/10 border-bear/30",
};

function fmtPrice(n: number) {
  if (n < 0.001) return n.toFixed(7);
  if (n < 1) return n.toFixed(4);
  return n.toFixed(2);
}

export function MemeRadar() {
  const { snapshot } = useLiveMarket();
  const memeCoins = snapshot.memeCoins;
  return (
    <section className="glass-card p-6 animate-rise">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Flame className="w-4 h-4 text-neon-pink animate-pulse-glow" />
            Meme Flow Radar
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Volume spikes, social hype, and risk tagging</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-warn" />
          <span className="text-muted-foreground">High volatility zone</span>
        </div>
      </div>

      <div className="space-y-2">
        {memeCoins.map((c) => (
          <div
            key={c.symbol}
            className="glass-panel p-3 grid grid-cols-12 items-center gap-3 hover:border-neon-pink/40 transition group"
          >
            <div className="col-span-12 sm:col-span-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-bear grid place-items-center text-xs font-bold text-background">
                {c.symbol.slice(0, 3)}
              </div>
              <div>
                <p className="text-sm font-semibold">{c.symbol}</p>
                <p className="text-[11px] text-muted-foreground">{c.name}</p>
              </div>
            </div>

            <div className="col-span-6 sm:col-span-2">
              <p className="text-sm font-mono">${fmtPrice(c.price)}</p>
              <p className={`text-xs flex items-center gap-0.5 ${c.change24h >= 0 ? "text-bull" : "text-bear"}`}>
                {c.change24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {c.change24h >= 0 ? "+" : ""}{c.change24h.toFixed(1)}%
              </p>
            </div>

            <div className="col-span-6 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Vol spike</p>
              <p className="text-sm font-semibold text-neon-cyan">{c.volumeSpike}%</p>
            </div>

            <div className="col-span-12 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Social hype</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                  <div className="h-full bg-gradient-cyber" style={{ width: `${c.socialHype}%` }} />
                </div>
                <span className="text-xs font-medium w-7 text-right">{c.socialHype}</span>
              </div>
            </div>

            <div className="col-span-12 sm:col-span-3 flex flex-wrap gap-1 justify-start sm:justify-end">
              {c.tags.map((t) => (
                <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${tagStyle[t]}`}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
