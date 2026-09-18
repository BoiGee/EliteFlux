import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, FlaskConical, Play, Power } from "lucide-react";
import {
  getSystemHealth,
  listDeliveryFailures,
  runBackgroundJob,
  runModelBacktest,
  setAutopilotKillSwitch,
} from "@/lib/admin.functions";
import { Section, SectionState } from "./Section";

const JOBS = [
  { id: "evaluate-alerts", label: "Check alerts now" },
  { id: "settle-payments", label: "Re-check pending payments" },
  { id: "expire-subs", label: "Expire lapsed plans" },
  { id: "retention-cleanup", label: "Run retention cleanup" },
] as const;

/** Plain-English name for whichever venue served the current prices. */
const SOURCE_LABEL: Record<string, string> = {
  keyed: "Main data source (licensed)",
  primary: "Main data source",
  secondary: "Secondary venue in use",
  aggregator: "Independent backup source in use",
  fallback: "Backup data source in use",
  extra: "Backup venue in use",
  mirror: "Backup venue (mirror) in use",
  stored: "Serving last saved prices — all live sources refused",
};


export function HealthPanel() {
  const qc = useQueryClient();
  const health = useServerFn(getSystemHealth);
  const failures = useServerFn(listDeliveryFailures);
  const runJob = useServerFn(runBackgroundJob);
  const setKill = useServerFn(setAutopilotKillSwitch);

  const q = useQuery({ queryKey: ["admin", "health"], queryFn: () => health(), refetchInterval: 60_000 });
  const f = useQuery({ queryKey: ["admin", "delivery-failures"], queryFn: () => failures() });

  const job = useMutation({
    mutationFn: (id: string) => runJob({ data: { job: id as any } }),
    onSuccess: (r: any) => {
      r?.ok === false ? toast.error(r.message) : toast.success(r.message ?? "Job finished.");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backtest = useServerFn(runModelBacktest);
  const backtestM = useMutation({
    mutationFn: () => backtest({ data: { regime: null } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const kill = useMutation({
    mutationFn: (on: boolean) => setKill({ data: { on } }),
    onSuccess: () => {
      toast.success("Automation switch updated.");
      qc.invalidateQueries({ queryKey: ["admin", "health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const h = q.data;
  const killOn = h?.killSwitch === true;

  return (
    <Section
      title="System health"
      icon={<Activity className="w-4 h-4 text-primary" />}
      action={
        <button
          onClick={() => {
            if (!confirm(killOn ? "Resume all automated trading?" : "Halt all automated trading immediately?")) return;
            kill.mutate(!killOn);
          }}
          className={`text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 ${
            killOn ? "border-bear text-bear bg-bear/10" : "border-border text-muted-foreground hover:text-white"
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          {killOn ? "Automation halted — resume" : "Halt all automation"}
        </button>
      }
    >
      <SectionState isLoading={q.isPending} isError={q.isError} onRetry={() => q.refetch()}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg border border-border p-3">
              <div className="text-muted-foreground">Data freshness</div>
              <div className={`text-base font-bold ${(h?.snapshotAgeMinutes ?? 0) > 30 ? "text-warn" : ""}`}>
                {h?.snapshotAgeMinutes === null || h?.snapshotAgeMinutes === undefined
                  ? "—"
                  : `${h.snapshotAgeMinutes} min ago`}
              </div>
              <div
                className={`mt-0.5 text-[11px] ${
                  h?.marketSource === "primary" || h?.marketSource === "keyed"
                    ? "text-muted-foreground"
                    : h?.marketSource === "unavailable"
                      ? "text-bear"
                      : "text-warn"
                }`}
              >
                {SOURCE_LABEL[h?.marketSource ?? ""] ?? `No data source · ${h?.marketError ?? "unavailable"}`}
              </div>
            </div>

            {(["email", "telegram", "webhook"] as const).map((c) => (
              <div key={c} className="rounded-lg border border-border p-3">
                <div className="text-muted-foreground capitalize">{c} (24h)</div>
                <div className="text-base font-bold">
                  {h?.deliveries?.[c]?.sent ?? 0}
                  <span className="text-bear text-xs font-normal"> · {h?.deliveries?.[c]?.failed ?? 0} failed</span>
                </div>
              </div>
            ))}
          </div>


          <div className="grid gap-2 sm:grid-cols-3">
            {(h?.jobs ?? []).map((j: any) => {
              const meta = JOBS.find((x) => x.id === j.job);
              const failing = (j.consecutiveFailures ?? 0) >= 2;
              const bad = j.stale || failing;
              return (
                <div
                  key={j.job}
                  className={`rounded-lg border p-3 text-xs ${bad ? "border-bear/50 bg-bear/5" : "border-border"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{j.job}</span>
                    <span className={bad ? "text-bear" : "text-bull"}>
                      {j.stale
                        ? "stalled"
                        : failing
                          ? `failing ×${j.consecutiveFailures}`
                          : j.recovered
                            ? "recovered now"
                            : "healthy"}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {j.ageMinutes === null
                      ? "never run"
                      : `last run ${j.ageMinutes} min ago · ${
                          j.lastStatus === "skipped" ? "stood down (no fresh data)" : j.lastStatus
                        }`}
                  </div>
                  <div className={`mt-0.5 ${j.recovered ? "text-warn" : "text-muted-foreground/80"}`}>
                    {j.recovered ? "Earlier incident · " : "last 24h: "}
                    {j.runs24h ?? 0} runs · {j.failed24h ?? 0} failed
                    {(j.skipped24h ?? 0) > 0 ? ` · ${j.skipped24h} stood down` : ""}
                    {j.recovered ? " · current run succeeded" : ""}
                  </div>

                  {failing && j.lastError && <div className="text-bear mt-1 break-words">{j.lastError}</div>}

                  <button
                    disabled={job.isPending}
                    onClick={() => job.mutate(j.job)}
                    className="mt-2 px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" /> {meta?.label ?? "Run now"}
                  </button>
                </div>
              );
            })}
          </div>


          <div className="rounded-lg border border-border p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold inline-flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-primary" /> Model backtest
              </span>
              <button
                disabled={backtestM.isPending}
                onClick={() => backtestM.mutate()}
                className="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 disabled:opacity-50"
              >
                {backtestM.isPending ? "Running…" : "Run"}
              </button>
            </div>
            <p className="text-muted-foreground mt-1">
              Replays measured 24h outcomes: does the live adaptive blend actually beat the hand-picked baseline,
              and does it generalize out-of-sample (trained on older data, tested on newer)?
            </p>
            {backtestM.data && (
              <div className="mt-2 space-y-2">
                <div
                  className={
                    backtestM.data.backtest.verdict === "improvement"
                      ? "text-bull"
                      : backtestM.data.backtest.verdict === "regression"
                        ? "text-bear"
                        : "text-muted-foreground"
                  }
                >
                  {backtestM.data.backtest.verdict === "insufficient_data"
                    ? "Not enough resolved outcomes yet to judge."
                    : `Live blend hit rate ${backtestM.data.backtest.current.weightedHitRate}% vs baseline ${backtestM.data.backtest.candidate.weightedHitRate}% (${backtestM.data.backtest.hitRateDelta >= 0 ? "+" : ""}${backtestM.data.backtest.hitRateDelta}pts, n=${backtestM.data.backtest.current.sampleSize})`}
                </div>
                <div
                  className={
                    backtestM.data.walkForward.verdict === "generalizes"
                      ? "text-bull"
                      : backtestM.data.walkForward.verdict === "overfits"
                        ? "text-bear"
                        : "text-muted-foreground"
                  }
                >
                  Walk-forward:{" "}
                  {backtestM.data.walkForward.verdict === "insufficient_data"
                    ? "not enough data for an out-of-sample split yet."
                    : `trained on data >${backtestM.data.walkForward.testWindow.days}d old, tested on the most recent ${backtestM.data.walkForward.testWindow.days}d — ${backtestM.data.walkForward.outOfSampleHitRate}% vs baseline ${backtestM.data.walkForward.baselineHitRate}% (${backtestM.data.walkForward.outOfSampleDelta >= 0 ? "+" : ""}${backtestM.data.walkForward.outOfSampleDelta}pts) → ${backtestM.data.walkForward.verdict.replace(/_/g, " ")}`}
                </div>
              </div>
            )}
          </div>

          {!!f.data?.failures?.length && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Recent delivery failures
              </div>
              <ul className="space-y-1 text-[11px]">
                {f.data.failures.slice(0, 8).map((r: any, i: number) => (
                  <li key={i} className="flex flex-wrap gap-2 border-b border-border/30 pb-1">
                    <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    <span className="capitalize">{r.channel}</span>
                    <span className="text-bear">{r.error ?? "unknown error"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Job</th>
                  <th className="pr-3">Started</th>
                  <th className="pr-3">Status</th>
                  <th className="pr-3">Checked</th>
                  <th className="pr-3">Fired</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {(h?.runs ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="py-2 pr-3">{r.job}</td>
                    <td className="pr-3">{new Date(r.started_at).toLocaleString()}</td>
                    <td
                      className={`pr-3 ${
                        r.status === "ok"
                          ? "text-bull"
                          : r.status === "skipped"
                            ? "text-warn"
                            : r.status === "running"
                              ? ""
                              : "text-bear"
                      }`}
                    >
                      {r.status}
                    </td>
                    <td className="pr-3">{r.evaluated}</td>
                    <td className="pr-3">{r.fired}</td>
                    <td>{r.errors}</td>
                  </tr>
                ))}
                {!h?.runs?.length && (
                  <tr>
                    <td colSpan={6} className="py-3 text-muted-foreground">
                      No background runs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionState>
    </Section>
  );
}
