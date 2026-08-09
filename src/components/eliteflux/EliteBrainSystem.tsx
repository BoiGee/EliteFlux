import {
  Activity,
  Bitcoin,
  Brain,
  Droplets,
  Flame,
  Layers,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEliteIntel } from "@/lib/market";

function colorFor(score: number) {
  if (score >= 81) return "bull";
  if (score >= 61) return "neon-cyan";
  if (score >= 31) return "warn";
  return "bear";
}

function LayerCard({
  icon: Icon,
  title,
  score,
  badge,
  badgeTone,
  children,
  delay = 0,
}: {
  icon: typeof Activity;
  title: string;
  score: number;
  badge: string;
  badgeTone: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const col = colorFor(score);
  return (
    <div
      className="glass-panel p-4 animate-rise relative overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, var(--${col}), transparent)` }}
      />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md grid place-items-center"
            style={{ background: `color-mix(in oklab, var(--${col}) 18%, transparent)` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: `var(--${col})` }} />
          </div>
          <p className="text-xs font-semibold tracking-tight">{title}</p>
        </div>
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            background: `color-mix(in oklab, var(--${badgeTone}) 18%, transparent)`,
            color: `var(--${badgeTone})`,
          }}
        >
          {badge}
        </span>
      </div>

      <div className="flex items-end justify-between mb-2">
        <span className="text-2xl font-bold" style={{ color: `var(--${col})` }}>
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
      <div className="h-1 rounded-full bg-surface overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: `var(--${col})`, boxShadow: `0 0 12px var(--${col})` }}
        />
      </div>

      <div className="text-[11px] text-muted-foreground space-y-1 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export function EliteBrainSystem() {
  const { brain, confidence } = useEliteIntel();
  const score = brain.eliteFluxScore;
  const col = brain.bandColor;
  const arcLen = 502; // 2πr for r=80, ~270° dasharray base
  const angle = (score / 100) * 270 - 135;

  return (
    <section className="glass-card p-6 lg:p-7 animate-rise relative overflow-hidden">
      {/* ambient glow */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ background: `radial-gradient(circle, var(--${col}), transparent 70%)` }}
      />
      <div className="absolute inset-0 grid-bg opacity-[0.04] pointer-events-none" />

      {/* Header */}
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-primary grid place-items-center glow-primary">
              <Brain className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-bull animate-pulse-glow text-bull" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Elite Brain System</p>
            <h2 className="text-lg lg:text-xl font-bold tracking-tight">
              Multi-layer Market Intelligence Engine
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
          <span className="px-2 py-1 rounded bg-surface/60 text-muted-foreground">
            Regime · <span style={{ color: `var(--${col})` }}>{brain.bitcoin.regime}</span>
          </span>
          <span className="px-2 py-1 rounded bg-surface/60 text-muted-foreground">
            Phase · <span className="text-foreground">{brain.liquidity.phase}</span>
          </span>
        </div>
      </div>

      {/* Hero score + insight */}
      <div className="relative grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 mb-6">
        <div className="relative flex flex-col items-center justify-center">
          <svg viewBox="0 0 220 200" className="w-full max-w-[300px]">
            <defs>
              <linearGradient id="ef-arc" x1="0" x2="1">
                <stop offset="0%" stopColor="var(--bear)" />
                <stop offset="35%" stopColor="var(--warn)" />
                <stop offset="65%" stopColor="var(--neon-cyan)" />
                <stop offset="100%" stopColor="var(--bull)" />
              </linearGradient>
              <filter id="ef-glow">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d="M 30 160 A 80 80 0 1 1 190 160"
              fill="none"
              stroke="oklch(0.3 0.04 270 / 0.5)"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M 30 160 A 80 80 0 1 1 190 160"
              fill="none"
              stroke="url(#ef-arc)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 377} 377`}
              filter="url(#ef-glow)"
            />
            {/* ticks */}
            {[0, 25, 50, 75, 100].map((t) => {
              const a = ((t / 100) * 270 - 135) * (Math.PI / 180);
              const x1 = 110 + Math.sin(a) * 96;
              const y1 = 160 - Math.cos(a) * 96;
              const x2 = 110 + Math.sin(a) * 104;
              const y2 = 160 - Math.cos(a) * 104;
              return (
                <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="oklch(0.5 0.04 270 / 0.6)" strokeWidth="1.5" />
              );
            })}
            <g transform={`rotate(${angle} 110 160)`}>
              <line x1="110" y1="160" x2="110" y2="80" stroke={`var(--${col})`} strokeWidth="3" strokeLinecap="round" />
              <circle cx="110" cy="160" r="10" fill="var(--background)" stroke={`var(--${col})`} strokeWidth="2.5" />
            </g>
            <text x="110" y="142" textAnchor="middle" className="fill-foreground" fontSize="44" fontWeight="800">
              {score}
            </text>
            <text x="110" y="162" textAnchor="middle" className="fill-muted-foreground" fontSize="10" letterSpacing="2">
              ELITE FLUX
            </text>
          </svg>
          <div className="-mt-2 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: `var(--${col})` }}>{brain.band}</div>
          <div
            className="mt-2 text-[11px] text-center text-muted-foreground max-w-[15rem]"
            title={confidence.reasons.join(" · ")}
          >
            Confidence in this read:{" "}
            <b
              className={
                confidence.band === "High"
                  ? "text-bull"
                  : confidence.band === "Moderate"
                    ? "text-warn"
                    : "text-bear"
              }
            >
              {confidence.band} ({confidence.score})
            </b>
            {confidence.reasons.length > 0 && (
              <span className="block mt-0.5 opacity-80">{confidence.reasons[0]}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Intelligence Headline</p>
            <h3 className="text-xl lg:text-2xl font-bold tracking-tight" style={{ color: `var(--${col})` }}>
              {brain.headline}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{brain.insight}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "0–30", txt: "Risk-Off", c: "bear" },
              { label: "31–60", txt: "Neutral", c: "warn" },
              { label: "61–80", txt: "Early Bull", c: "neon-cyan" },
              { label: "81–100", txt: "Strong Bull", c: "bull" },
            ].map((b) => {
              const active = b.c === col;
              return (
                <div
                  key={b.label}
                  className={`glass-panel p-2 text-center transition-all ${active ? "ring-1" : "opacity-60"}`}
                  style={active ? { boxShadow: `0 0 24px -6px var(--${b.c})`, borderColor: `var(--${b.c})` } : {}}
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{b.label}</p>
                  <p className="text-xs font-semibold" style={{ color: `var(--${b.c})` }}>{b.txt}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Five layers */}
      <div className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <LayerCard
          icon={Bitcoin}
          title="Bitcoin Control"
          score={brain.bitcoin.score}
          badge={brain.bitcoin.regime}
          badgeTone={brain.bitcoin.regime === "Risk-On" ? "bull" : brain.bitcoin.regime === "Risk-Off" ? "bear" : "warn"}
          delay={0}
        >
          <div className="flex justify-between"><span>Trend</span><span className="text-foreground">{brain.bitcoin.trend}</span></div>
          <div className="flex justify-between"><span>Volatility</span><span className="text-foreground">{brain.bitcoin.volatility}</span></div>
          <div className="flex justify-between"><span>BTC.D</span><span className="text-foreground">{brain.bitcoin.dominance}% · {brain.bitcoin.dominanceTrend}</span></div>
        </LayerCard>

        <LayerCard
          icon={Droplets}
          title="Liquidity Flow"
          score={brain.liquidity.score}
          badge={brain.liquidity.phase.split(" ")[0]}
          badgeTone="neon-cyan"
          delay={60}
        >
          <div className="flex justify-between"><span>BTC</span><span className="text-foreground">{brain.liquidity.btcShare.toFixed(0)}%</span></div>
          <div className="flex justify-between"><span>Alts</span><span className="text-foreground">{brain.liquidity.altShare.toFixed(0)}%</span></div>
          <div className="flex justify-between"><span>Meme</span><span className="text-foreground">{brain.liquidity.memeShare.toFixed(0)}%</span></div>
        </LayerCard>

        <LayerCard
          icon={Sparkles}
          title="Narrative Momentum"
          score={brain.narrative.score}
          badge={`${brain.narrative.risingCount} rising`}
          badgeTone="neon-purple"
          delay={120}
        >
          {brain.narrative.leaders.map((l) => (
            <div key={l.name} className="flex justify-between">
              <span className="truncate">{l.name}</span>
              <span className="text-foreground flex items-center gap-1">
                {l.strength}
                {l.direction === "rising" ? (
                  <TrendingUp className="w-3 h-3 text-bull" />
                ) : l.direction === "fading" ? (
                  <TrendingDown className="w-3 h-3 text-bear" />
                ) : (
                  <Activity className="w-3 h-3 text-muted-foreground" />
                )}
              </span>
            </div>
          ))}
        </LayerCard>

        <LayerCard
          icon={Layers}
          title="Altcoin Strength"
          score={brain.altcoin.score}
          badge={`Breadth ${brain.altcoin.breadth}%`}
          badgeTone="neon-blue"
          delay={180}
        >
          {brain.altcoin.topPerformers.slice(0, 3).map((p) => (
            <div key={p.symbol} className="flex justify-between">
              <span>{p.symbol}</span>
              <span className={`${p.vsBtc >= 0 ? "text-bull" : "text-bear"}`}>
                {p.vsBtc >= 0 ? "+" : ""}
                {p.vsBtc}% vs BTC
              </span>
            </div>
          ))}
        </LayerCard>

        <LayerCard
          icon={ShieldAlert}
          title="Risk Compression"
          score={brain.risk.score}
          badge={`${brain.risk.risk} Risk`}
          badgeTone={brain.risk.risk === "High" ? "bear" : brain.risk.risk === "Medium" ? "warn" : "bull"}
          delay={240}
        >
          {brain.risk.signals.slice(0, 3).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-warn" />
              <span>{s}</span>
            </div>
          ))}
        </LayerCard>
      </div>

      {/* Footer pulse */}
      <div className="relative mt-5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-neon-cyan" />
          <span>Elite Brain · live cognition engine</span>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: `var(--${col})` }}>
          <Flame className="w-3 h-3" />
          <span>Pulse {brain.pulse}</span>
        </div>
      </div>
    </section>
  );
}
