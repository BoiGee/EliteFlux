import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { getPublicTrackRecord } from "@/lib/track-record.functions";
import { BrandLockup } from "./BrandLogo";

export function TrackRecord() {
  const load = useServerFn(getPublicTrackRecord);
  const q = useQuery({
    queryKey: ["public", "track-record"],
    queryFn: () => load(),
    staleTime: 5 * 60_000,
  });

  const d = q.data;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <BrandLockup size="md" />

        <div className="mt-8 glass-card p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <ShieldCheck className="w-5 h-5 text-bull" />
            <h1 className="text-xl font-bold">Track Record</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Every signal EliteFlux publishes is timestamped and graded against what actually happened. This page is
            the raw, unfiltered scoreboard — updated continuously, nothing hidden. We show a signal is drifting
            instead of quietly dropping it.
          </p>

          {q.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading measured accuracy…</p>}
          {q.isError && <p className="mt-6 text-sm text-bear">Track record temporarily unavailable.</p>}

          {d && (
            <>
              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="glass-panel p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall 24h hit rate</p>
                  <p className="text-2xl font-bold mt-1">{d.overallHitRate === null ? "—" : `${d.overallHitRate}%`}</p>
                </div>
                <div className="glass-panel p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Graded signals (30d)</p>
                  <p className="text-2xl font-bold mt-1">{d.totalSamples.toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-2 pr-3">Signal</th>
                      <th className="pr-3">30d hit rate</th>
                      <th className="pr-3">7d (recent)</th>
                      <th className="pr-3">Avg forward return</th>
                      <th>Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.families.map((f) => {
                      const drifting = f.recentHitRatePct !== null && f.recentHitRatePct < f.hitRatePct - 15;
                      return (
                        <tr key={f.signal} className="border-t border-border/50">
                          <td className="py-2 pr-3 font-medium">{f.label}</td>
                          <td className="pr-3">{f.hitRatePct}%</td>
                          <td className={`pr-3 ${drifting ? "text-warn" : ""}`}>
                            {f.recentHitRatePct === null ? "—" : `${f.recentHitRatePct}%`}
                            {drifting && " ⚠ drifting"}
                          </td>
                          <td className="pr-3">
                            {f.avgReturnPct >= 0 ? "+" : ""}
                            {f.avgReturnPct}%
                          </td>
                          <td className="text-muted-foreground">{f.samples}</td>
                        </tr>
                      );
                    })}
                    {!d.families.length && (
                      <tr>
                        <td colSpan={5} className="py-4 text-muted-foreground">
                          Not enough graded signals yet — check back soon.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-[11px] text-muted-foreground">
                "Hit rate" measures directional accuracy at a 24-hour horizon only; past performance is measured
                history, not a promise about the future. Generated {new Date(d.generatedAt).toLocaleString()}.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
