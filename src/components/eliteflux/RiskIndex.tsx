import { ShieldAlert } from "lucide-react";
import { computeRiskIndex } from "@/lib/elite-brain";
import { useLiveMarket } from "@/lib/market";

export function RiskIndex() {
  const { snapshot } = useLiveMarket();
  const { score, label, description } = computeRiskIndex(snapshot);
  const angle = (score / 100) * 270 - 135;

  const zone = score >= 71 ? "bull" : score >= 31 ? "warn" : "bear";
  const zoneCol = zone === "bull" ? "text-bull" : zone === "warn" ? "text-warn" : "text-bear";

  return (
    <section className="glass-card p-6 animate-rise overflow-hidden relative">
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-neon-blue/10 blur-3xl pointer-events-none" />
      <div className="flex items-center justify-between mb-4 relative">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className={`w-4 h-4 ${zoneCol}`} />
            Risk Sentiment Index
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Composite of BTC trend, dominance, momentum & volume</p>
        </div>
      </div>

      <div className="flex flex-col items-center relative">
        <svg viewBox="0 0 220 180" className="w-full max-w-xs">
          <defs>
            <linearGradient id="risk-arc" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--bear)" />
              <stop offset="50%" stopColor="var(--warn)" />
              <stop offset="100%" stopColor="var(--bull)" />
            </linearGradient>
          </defs>
          <path d="M 30 150 A 80 80 0 1 1 190 150" fill="none" stroke="oklch(0.3 0.04 270 / 0.5)" strokeWidth="14" strokeLinecap="round" />
          <path
            d="M 30 150 A 80 80 0 1 1 190 150"
            fill="none"
            stroke="url(#risk-arc)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 377} 377`}
            style={{ filter: "drop-shadow(0 0 8px var(--neon-blue))" }}
          />
          <g transform={`rotate(${angle} 110 150)`}>
            <line x1="110" y1="150" x2="110" y2="70" stroke="currentColor" className={zoneCol} strokeWidth="3" strokeLinecap="round" />
            <circle cx="110" cy="150" r="9" fill="var(--background)" stroke="currentColor" className={zoneCol} strokeWidth="2.5" />
          </g>
          <text x="110" y="135" textAnchor="middle" className="fill-foreground" fontSize="38" fontWeight="700">
            {score}
          </text>
          <text x="110" y="155" textAnchor="middle" className="fill-muted-foreground" fontSize="10">
            /100
          </text>
        </svg>

        <div className={`mt-1 text-sm font-semibold uppercase tracking-wider ${zoneCol}`}>{label}</div>
        <p className="mt-2 text-xs text-center text-muted-foreground max-w-xs">{description}</p>

        <div className="mt-5 w-full grid grid-cols-3 gap-2 text-center">
          <div className="glass-panel p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">0–30</p>
            <p className="text-xs font-medium text-bear">High Risk</p>
          </div>
          <div className="glass-panel p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">31–70</p>
            <p className="text-xs font-medium text-warn">Mixed</p>
          </div>
          <div className="glass-panel p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">71–100</p>
            <p className="text-xs font-medium text-bull">Bullish</p>
          </div>
        </div>
      </div>
    </section>
  );
}
