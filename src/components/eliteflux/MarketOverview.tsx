import { ArrowDownRight, ArrowUpRight, Bitcoin, Droplets, Gauge, Sparkles } from "lucide-react";
import { useLiveMarket } from "@/lib/market";

function fmtUsd(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function Sparkline({ color }: { color: string }) {
  const pts = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16];
  const path = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${20 - p}`).join(" ");
  return (
    <svg viewBox="0 0 100 22" className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={`var(--${color})`} stopOpacity="0.5" />
          <stop offset="100%" stopColor={`var(--${color})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={path} fill="none" stroke={`var(--${color})`} strokeWidth="1.5" />
      <polygon points={`0,22 ${path} 100,22`} fill={`url(#spark-${color})`} />
    </svg>
  );
}

function Gauge180({ value, label, color = "neon-blue" }: { value: number; label: string; color?: string }) {
  const angle = (value / 100) * 180 - 90;
  return (
    <div className="relative w-full">
      <svg viewBox="0 0 200 110" className="w-full">
        <defs>
          <linearGradient id={`g-${label}`} x1="0" x2="1">
            <stop offset="0%" stopColor="var(--bear)" />
            <stop offset="50%" stopColor="var(--warn)" />
            <stop offset="100%" stopColor="var(--bull)" />
          </linearGradient>
        </defs>
        <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="oklch(0.3 0.04 270 / 0.5)" strokeWidth="10" strokeLinecap="round" />
        <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke={`url(#g-${label})`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * 267} 267`} />
        <g transform={`rotate(${angle} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="30" stroke={`var(--${color})`} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill={`var(--${color})`} />
        </g>
      </svg>
    </div>
  );
}

export function MarketOverview() {
  const { snapshot } = useLiveMarket();
  const m = snapshot.marketOverview;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="glass-card p-5 animate-rise">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-warn/15 grid place-items-center">
              <Bitcoin className="w-5 h-5 text-warn" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bitcoin</p>
              <p className="text-xs font-medium uppercase tracking-wider text-bull">{m.btcTrend}</p>
            </div>
          </div>
          <span className={`text-xs flex items-center gap-0.5 ${m.btcChange24h >= 0 ? "text-bull" : "text-bear"}`}>
            {m.btcChange24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {m.btcChange24h.toFixed(2)}%
          </span>
        </div>
        <p className="mt-4 text-3xl font-bold tracking-tight">${m.btcPrice.toLocaleString()}</p>
        <Sparkline color="warn" />
      </div>

      <div className="glass-card p-5 animate-rise" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-lg bg-neon-blue/15 grid place-items-center">
            <Gauge className="w-5 h-5 text-neon-blue" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">BTC Dominance</p>
            <p className="text-xs font-medium uppercase tracking-wider">{m.btcDominanceChange >= 0 ? "Expanding" : "Compressing"}</p>
          </div>
        </div>
        <Gauge180 value={m.btcDominance} label="dom" color="neon-blue" />
        <div className="flex items-end justify-between -mt-4">
          <div>
            <p className="text-3xl font-bold tracking-tight">{m.btcDominance}%</p>
            <p className={`text-xs ${m.btcDominanceChange >= 0 ? "text-bull" : "text-bear"}`}>
              {m.btcDominanceChange >= 0 ? "+" : ""}{m.btcDominanceChange}% 24h
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 animate-rise" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-lg bg-neon-purple/15 grid place-items-center">
            <Sparkles className="w-5 h-5 text-neon-purple" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Market Sentiment</p>
            <p className="text-xs font-medium uppercase tracking-wider text-neon-purple">{m.sentiment.label}</p>
          </div>
        </div>
        <Gauge180 value={m.sentiment.score} label="sent" color="neon-purple" />
        <div className="-mt-4">
          <p className="text-3xl font-bold tracking-tight">{m.sentiment.score}<span className="text-base text-muted-foreground">/100</span></p>
          <p className="text-xs text-muted-foreground">Fear &amp; Greed composite</p>
        </div>
      </div>

      <div className="glass-card p-5 animate-rise" style={{ animationDelay: "180ms" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-neon-cyan/15 grid place-items-center">
              <Droplets className="w-5 h-5 text-neon-cyan" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Liquidity Flow</p>
              <p className="text-xs font-medium uppercase tracking-wider text-neon-cyan">Routing to {m.liquidityFlow.target}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {(["Bitcoin", "Altcoins", "Meme Coins"] as const).map((t) => {
            const active = t === m.liquidityFlow.target;
            const val = active ? m.liquidityFlow.strength : t === "Bitcoin" ? 22 : 18;
            return (
              <div key={t}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={active ? "text-foreground font-medium" : "text-muted-foreground"}>{t}</span>
                  <span className={active ? "text-neon-cyan" : "text-muted-foreground"}>{val}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className={`h-full rounded-full ${active ? "bg-gradient-cyber" : "bg-muted-foreground/30"}`}
                    style={{ width: `${val}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>24h Vol {fmtUsd(m.volume24h)}</span>
          <span>Cap {fmtUsd(m.totalMarketCap)}</span>
        </div>
      </div>
    </div>
  );
}
