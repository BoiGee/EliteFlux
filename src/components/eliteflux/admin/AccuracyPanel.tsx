import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Target, TrendingDown } from "lucide-react";
import { getModelAccuracy } from "@/lib/admin.functions";
import { Section, SectionState } from "./Section";

const LABELS: Record<string, string> = {
  flux_score: "Overall market read",
  sentiment: "Market mood",
  whale: "Large-holder activity",
  narrative: "Theme rotation",
  momentum: "Momentum build-up",
  smart_money: "Institutional flow",
  pump_pressure: "Overheat warning",
  exit_pressure: "Exit warning",
};

const HORIZONS = [
  { h: 1, label: "1h" },
  { h: 4, label: "4h" },
  { h: 24, label: "24h" },
  { h: 168, label: "7d" },
];

const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function rateTone(rate: number) {
  if (rate >= 0.6) return "text-bull";
  if (rate >= 0.5) return "text-warn";
  return "text-bear";
}

/** Honest scoreboard: how often each intelligence layer actually called it right. */
export function AccuracyPanel() {
  const [horizon, setHorizon] = useState(24);
  const fn = useServerFn(getModelAccuracy);
  const q = useQuery({
    queryKey: ["admin", "accuracy"],
    queryFn: () => fn({ data: { days: 30 } }),
    refetchInterval: 5 * 60_000,
  });

  const d = q.data;
  const rows = (d?.signals ?? []).filter((s) => s.horizonHours === horizon);

  return (
    <Section
      title="Model accuracy"
      icon={<Target className="w-4 h-4 text-primary" />}
      action={
        <div className="flex gap-1">
          {HORIZONS.map((h) => (
            <button
              key={h.h}
              onClick={() => setHorizon(h.h)}
              className={`h-7 px-2.5 rounded-md text-xs font-bold ${
                horizon === h.h ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      }
    >
      <SectionState
        isLoading={q.isLoading}
        isError={q.isError}
        isEmpty={!q.isLoading && rows.length === 0}
        emptyText="No graded signals yet at this horizon — the scoreboard fills in as signals mature."
        onRetry={() => q.refetch()}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Overall accuracy" value={pct(d?.overallHitRate)} />
            <Stat label="Graded signals" value={String(d?.gradedSamples ?? 0)} />
            <Stat label="Awaiting outcome" value={String(d?.pendingSignals ?? 0)} />
            <Stat
              label="Blend recalculated"
              value={
                d?.weightsComputedAt ? new Date(d.weightsComputedAt).toLocaleString() : "not yet"
              }
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-3 font-semibold">Signal</th>
                  <th className="py-2 pr-3 font-semibold">Accuracy (30d)</th>
                  <th className="py-2 pr-3 font-semibold">Last 7d</th>
                  <th className="py-2 pr-3 font-semibold">Avg move</th>
                  <th className="py-2 pr-3 font-semibold">Samples</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={`${s.signalType}-${s.horizonHours}`} className="border-t border-border/40">
                    <td className="py-2 pr-3 font-semibold">
                      {LABELS[s.signalType] ?? s.signalType.replace(/_/g, " ")}
                      {s.drifting && (
                        <span className="ml-2 inline-flex items-center gap-1 text-bear font-bold">
                          <TrendingDown className="w-3 h-3" /> degrading
                        </span>
                      )}
                    </td>
                    <td className={`py-2 pr-3 font-bold ${rateTone(s.hitRate)}`}>{pct(s.hitRate)}</td>
                    <td className="py-2 pr-3">{pct(s.recentHitRate)}</td>
                    <td className={`py-2 pr-3 ${s.avgReturnPct >= 0 ? "text-bull" : "text-bear"}`}>
                      {s.avgReturnPct >= 0 ? "+" : ""}
                      {s.avgReturnPct.toFixed(2)}%
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{s.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d?.weights && (
            <div className="rounded-lg border border-border/40 p-3">
              <p className="text-xs font-semibold mb-2">
                Current blend (measured from {d.weightsSampleSize} graded outcomes)
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(d.weights).map(([layer, w]) => (
                  <span key={layer} className="text-[11px] px-2 py-1 rounded-md bg-secondary/60">
                    {layer}: <b>{Math.round((w as number) * 100)}%</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionState>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold truncate">{value}</p>
    </div>
  );
}
