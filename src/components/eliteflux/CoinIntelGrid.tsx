import { ArrowDownRight, ArrowUpRight, Sparkles, Wallet } from "lucide-react";
import { useEliteIntel } from "@/lib/market";
import type { OnChainSignalType } from "@/lib/onchain-intel";

const catColor: Record<string, string> = {
  AI: "text-neon-cyan bg-neon-cyan/10 border-neon-cyan/30",
  Meme: "text-neon-pink bg-neon-pink/10 border-neon-pink/30",
  L1: "text-neon-purple bg-neon-purple/10 border-neon-purple/30",
  "Large Cap": "text-warn bg-warn/10 border-warn/30",
  RWA: "text-bull bg-bull/10 border-bull/30",
  Infra: "text-muted-foreground bg-muted/30 border-border",
};
const riskColor = { Low: "text-bull", Medium: "text-warn", High: "text-bear" };

const PULSE_CLASS: Record<OnChainSignalType, string> = {
  whale_accumulation: "onchain-bull",
  exchange_outflow_accumulation: "onchain-bull",
  whale_distribution: "onchain-bear",
  exchange_inflow_spike: "onchain-warn",
  smart_money_cluster: "onchain-cyan",
  large_single_transfer: "onchain-warn",
};

const BADGE_LABEL: Partial<Record<OnChainSignalType, string>> = {
  smart_money_cluster: "SMART MONEY ACTIVE",
  exchange_outflow_accumulation: "EXCH OUTFLOW",
  exchange_inflow_spike: "EXCH INFLOW",
  whale_accumulation: "WHALE BUY",
  whale_distribution: "WHALE SELL",
  large_single_transfer: "WHALE ALERT",
};

function fmt(n: number) {
  if (n < 0.001) return n.toFixed(7);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString();
}

export function CoinIntelGrid() {
  const { snapshot, onchain } = useEliteIntel();
  const coinIntel = snapshot.coinIntel;
  return (
    <section className="glass-card p-6 animate-rise">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="w-4 h-4 text-neon-blue" />
            Coin Intelligence
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Per-asset momentum, risk, flow &amp; live on-chain pulses</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {coinIntel.map((c) => {
          const sig = onchain.perAsset[c.symbol];
          const pulse = sig ? PULSE_CLASS[sig.type] : "";
          const badge = sig ? BADGE_LABEL[sig.type] : null;
          return (
            <article
              key={c.symbol}
              className={`glass-panel p-4 hover:-translate-y-0.5 transition-all relative ${pulse}`}
            >
              {badge && (
                <span className="absolute -top-2 right-3 text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-background border border-border/70 flex items-center gap-1">
                  {sig?.type === "smart_money_cluster" && <Sparkles className="w-2.5 h-2.5 text-neon-cyan" />}
                  {badge}
                </span>
              )}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-primary grid place-items-center text-xs font-bold text-primary-foreground">
                    {c.symbol.slice(0, 3)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{c.symbol}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${catColor[c.category]}`}>
                  {c.category}
                </span>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-xl font-bold font-mono">${fmt(c.price)}</p>
                <span className={`text-xs flex items-center gap-0.5 ${c.change24h >= 0 ? "text-bull" : "text-bear"}`}>
                  {c.change24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {c.change24h >= 0 ? "+" : ""}{c.change24h.toFixed(2)}%
                </span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <span>Momentum</span>
                  <span className="text-foreground font-semibold">{c.momentum}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div className="h-full bg-gradient-cyber" style={{ width: `${c.momentum}%` }} />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <p className="uppercase tracking-wider text-muted-foreground">Risk</p>
                  <p className={`text-xs font-semibold ${riskColor[c.risk]}`}>{c.risk}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider text-muted-foreground">BTC Corr</p>
                  <p className="text-xs font-semibold">{c.btcCorrelation}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider text-muted-foreground">Flow</p>
                  <p className={`text-xs font-semibold ${c.flow === "Accumulation" ? "text-bull" : "text-bear"}`}>{c.flow}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
