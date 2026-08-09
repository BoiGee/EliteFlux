import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { getCohortAnalytics } from "@/lib/admin.functions";
import { Section, SectionState, Stat } from "./Section";

/** Anonymized, aggregate-only view of how the user base is behaving. Never a per-user record. */
export function CohortPanel() {
  const fn = useServerFn(getCohortAnalytics);
  const q = useQuery({ queryKey: ["admin", "cohort"], queryFn: () => fn(), refetchInterval: 5 * 60_000 });
  const d = q.data;

  return (
    <Section title="Cohort analytics" icon={<Users className="w-4 h-4 text-primary" />}>
      <SectionState isLoading={q.isPending} isError={q.isError} onRetry={() => q.refetch()}>
        {d && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Stat
                label="Autopilot armed"
                value={`${d.autopilot.armedCount}/${d.autopilot.totalConfigured}`}
              />
              <Stat
                label="Coach feedback"
                value={d.coachFeedback.positiveRatioPct === null ? "—" : `${d.coachFeedback.positiveRatioPct}% positive`}
                tone={d.coachFeedback.positiveRatioPct === null ? undefined : d.coachFeedback.positiveRatioPct >= 60 ? "bull" : d.coachFeedback.positiveRatioPct <= 40 ? "bear" : "warn"}
              />
              <Stat label="Symbols with community trust" value={d.communityTrust.symbolsRated} />
              <Stat label="Watchlisted symbols tracked" value={Object.keys(d.crowdPositioning ?? {}).length} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Plan distribution</p>
                <div className="space-y-1 text-xs">
                  {Object.entries(d.tierDistribution).length === 0 && <p className="text-muted-foreground">No active subscriptions yet.</p>}
                  {Object.entries(d.tierDistribution).map(([tier, count]) => (
                    <div key={tier} className="flex items-center justify-between">
                      <span className="capitalize">{tier}</span>
                      <span className="font-mono font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Risk sensitivity</p>
                <div className="space-y-1 text-xs">
                  {Object.entries(d.riskDistribution).length === 0 && <p className="text-muted-foreground">No profiles yet.</p>}
                  {Object.entries(d.riskDistribution).map(([risk, count]) => (
                    <div key={risk} className="flex items-center justify-between">
                      <span className="capitalize">{risk}</span>
                      <span className="font-mono font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Most watchlisted</p>
                <div className="space-y-1 text-xs">
                  {d.topWatchlisted.length === 0 && <p className="text-muted-foreground">No watchlist activity yet.</p>}
                  {d.topWatchlisted.map((w) => (
                    <div key={w.symbol} className="flex items-center justify-between">
                      <span className="font-mono">{w.symbol}</span>
                      <span className="font-mono font-bold">{w.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Community trust (opportunity feedback, ≥3 raters)
                </p>
                {d.communityTrust.symbolsRated === 0 ? (
                  <p className="text-xs text-muted-foreground">Not enough opportunity ratings yet.</p>
                ) : (
                  <div className="space-y-1 text-xs">
                    {d.communityTrust.mostTrusted.map((t) => (
                      <div key={`up-${t.symbol}`} className="flex items-center justify-between text-bull">
                        <span className="font-mono">{t.symbol}</span>
                        <span>
                          {t.upvotes}↑ {t.downvotes}↓
                        </span>
                      </div>
                    ))}
                    {d.communityTrust.leastTrusted
                      .filter((t) => !d.communityTrust.mostTrusted.some((m) => m.symbol === t.symbol))
                      .map((t) => (
                        <div key={`down-${t.symbol}`} className="flex items-center justify-between text-bear">
                          <span className="font-mono">{t.symbol}</span>
                          <span>
                            {t.upvotes}↑ {t.downvotes}↓
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SectionState>
    </Section>
  );
}
