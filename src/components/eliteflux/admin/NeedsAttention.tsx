import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { getSystemHealth } from "@/lib/admin.functions";

/** The one strip that tells an operator whether anything needs them today. */
export function NeedsAttention() {
  const health = useServerFn(getSystemHealth);
  const q = useQuery({ queryKey: ["admin", "health"], queryFn: () => health(), refetchInterval: 60_000 });
  const h = q.data;
  if (!h) return null;

  const items: string[] = [];
  if (h.pendingPayments > 0)
    items.push(`${h.pendingPayments} payment${h.pendingPayments === 1 ? "" : "s"} waiting on a decision`);
  for (const j of h.jobs) {
    if (j.stale) items.push(`the "${j.job}" background job has stopped running`);
    else if ((j.consecutiveFailures ?? 0) >= 2)
      items.push(
        `the "${j.job}" background job has failed ${j.consecutiveFailures} times in a row — ${j.lastError ?? "unknown error"}`,
      );
  }
  if (h.marketSource === "unavailable") items.push(`market data is unavailable — ${h.marketError ?? "unknown error"}`);
  else if (h.marketSource === "fallback") items.push("market prices are coming from the backup data source");
  if ((h.snapshotAgeMinutes ?? 0) > 30) items.push(`market data is ${h.snapshotAgeMinutes} minutes old`);
  const failed = Object.values(h.deliveries).reduce((a: number, b: any) => a + b.failed, 0);
  if (failed > 0) items.push(`${failed} alert deliveries failed in the last 24h`);
  if (h.killSwitch) items.push("automation is currently halted platform-wide");

  if (!items.length) {
    return (
      <div className="rounded-lg border border-bull/40 bg-bull/10 px-4 py-2.5 text-xs text-bull font-semibold">
        All clear — nothing needs your attention right now.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-xs">
      <div className="flex items-center gap-2 font-bold text-warn mb-1.5">
        <AlertTriangle className="w-4 h-4" /> Needs your attention
      </div>
      <ul className="list-disc pl-5 space-y-0.5">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
