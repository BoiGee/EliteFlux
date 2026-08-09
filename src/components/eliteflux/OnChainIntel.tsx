import { Activity, Anchor, ArrowDownToLine, ArrowUpFromLine, Layers2, Shield, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useEliteIntel } from "@/lib/market";
import type { OnChainSignal, OnChainSignalType } from "@/lib/onchain-intel";

const ICONS: Record<OnChainSignalType, typeof Activity> = {
  whale_accumulation: TrendingUp,
  whale_distribution: Activity,
  exchange_inflow_spike: ArrowUpFromLine,
  exchange_outflow_accumulation: ArrowDownToLine,
  smart_money_cluster: Sparkles,
  large_single_transfer: Zap,
};

const TONE: Record<OnChainSignalType, string> = {
  whale_accumulation: "bull",
  whale_distribution: "bear",
  exchange_inflow_spike: "warn",
  exchange_outflow_accumulation: "bull",
  smart_money_cluster: "neon-cyan",
  large_single_transfer: "warn",
};

const LABEL: Record<OnChainSignalType, string> = {
  whale_accumulation: "Whale Accumulation",
  whale_distribution: "Whale Distribution",
  exchange_inflow_spike: "Exchange Inflow Spike",
  exchange_outflow_accumulation: "Exchange Outflow",
  smart_money_cluster: "Smart Money Cluster",
  large_single_transfer: "Whale Alert",
};

function SignalRow({ s }: { s: OnChainSignal }) {
  const Icon = ICONS[s.type];
  const tone = TONE[s.type];
  return (
    <div
      className="glass-panel p-3 flex items-start gap-3 border-l-2"
      style={{ borderLeftColor: `var(--${tone})` }}
    >
      <div
        className="w-8 h-8 rounded-md grid place-items-center shrink-0"
        style={{ background: `color-mix(in oklab, var(--${tone}) 18%, transparent)` }}
      >
        <Icon className="w-4 h-4" style={{ color: `var(--${tone})` }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold tracking-tight">{s.asset}</span>
            <span
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: `var(--${tone})` }}
            >
              {LABEL[s.type]}
            </span>
          </div>
          <span className="text-[10px] uppercase text-muted-foreground">{s.confidence}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{s.rationale}</p>
        <div className="mt-1.5 h-1 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${s.intensity}%`, background: `var(--${tone})` }}
          />
        </div>
      </div>
    </div>
  );
}

export function OnChainIntel() {
  const { onchain } = useEliteIntel();
  const top = onchain.signals.slice(0, 8);

  return (
    <section className="glass-card p-5 animate-rise">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-primary grid place-items-center glow-primary">
            <Anchor className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              On-Chain Intelligence
            </p>
            <h3 className="text-base font-bold tracking-tight">Wallet Flows &amp; Smart Money</h3>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-surface/60 text-muted-foreground">
          {onchain.signals.length} active
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="glass-panel p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Shield className="w-3 h-3 text-neon-cyan" />
            Smart Money Confidence
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-neon-cyan">
            {onchain.smartMoneyConfidenceIndex}
          </p>
          <div className="mt-1.5 h-1 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-gradient-cyber"
              style={{ width: `${onchain.smartMoneyConfidenceIndex}%` }}
            />
          </div>
        </div>
        <div className="glass-panel p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Layers2 className="w-3 h-3 text-bull" />
            Market Conviction
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-bull">
            {onchain.marketConvictionScore}
          </p>
          <div className="mt-1.5 h-1 rounded-full bg-surface overflow-hidden">
            <div
              className="h-full bg-gradient-bull"
              style={{ width: `${onchain.marketConvictionScore}%` }}
            />
          </div>
        </div>
      </div>

      {top.length === 0 ? (
        <div className="glass-panel p-4 text-xs text-muted-foreground">
          Monitoring on-chain wallet flows — no significant movements detected yet.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
          {top.map((s) => (
            <SignalRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </section>
  );
}
