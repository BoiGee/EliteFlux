import { AlertTriangle, CircleCheck, CircleAlert } from "lucide-react";
import { useEliteIntel } from "@/lib/market";
import { evaluateTradingConditions, type ConditionLight } from "@/lib/trading-conditions";

const TONE: Record<ConditionLight, { ring: string; text: string; icon: typeof AlertTriangle }> = {
  green: { ring: "border-bull/40 bg-bull/10", text: "text-bull", icon: CircleCheck },
  amber: { ring: "border-amber-400/40 bg-amber-400/10", text: "text-amber-400", icon: CircleAlert },
  red: { ring: "border-bear/40 bg-bear/10", text: "text-bear", icon: AlertTriangle },
};

/**
 * Always-visible "trade or stand down" verdict, computed from the same rules the
 * coach uses so the banner and the chat can never disagree.
 */
export function TradingConditionsBanner({ className = "" }: { className?: string }) {
  const { brain, exit, pressure, brainV3, sentiment } = useEliteIntel();

  const v = evaluateTradingConditions({
    fluxScore: brain.eliteFluxScore,
    regime: brainV3.regime || brain.regime,
    exitPressure: exit.marketExitPressure,
    pumpPressureScore: pressure.score,
    pumpPressureBand: pressure.band,
    cognitionConfidence: brainV3.confidence,
    sentimentScore: sentiment.score,
  });

  const tone = TONE[v.light];
  const Icon = tone.icon;

  return (
    <div className={`rounded-xl border px-4 py-3 ${tone.ring} ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.text}`} />
        <div className="min-w-0">
          <p className="text-sm font-bold">
            <span className={tone.text}>{v.headline}</span>
            <span className="text-muted-foreground font-normal"> — {v.plain}</span>
          </p>
          {v.reasons.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {v.reasons.map((r) => (
                <li key={r} className="text-[11px] text-muted-foreground leading-relaxed">
                  · {r}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground/80">{v.flipCondition}</p>
        </div>
      </div>
    </div>
  );
}
