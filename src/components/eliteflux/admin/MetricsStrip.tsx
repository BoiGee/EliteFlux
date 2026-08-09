import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3 } from "lucide-react";
import { getAdminMetrics } from "@/lib/admin.functions";
import { Section, SectionState, Stat } from "./Section";

/** Answers "how is the business doing" without reading four tables by eye. */
export function MetricsStrip() {
  const get = useServerFn(getAdminMetrics);
  const q = useQuery({ queryKey: ["admin", "metrics"], queryFn: () => get(), refetchInterval: 120_000 });
  const m = q.data;

  return (
    <Section title="At a glance" icon={<BarChart3 className="w-4 h-4 text-primary" />}>
      <SectionState isLoading={q.isPending} isError={q.isError} onRetry={() => q.refetch()}>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Stat label="Total users" value={m?.users ?? 0} />
          <Stat label="New (24h)" value={m?.new24h ?? 0} tone={(m?.new24h ?? 0) > 0 ? "bull" : undefined} />
          <Stat label="New (7d)" value={m?.new7d ?? 0} />
          <Stat label="Active Pro" value={m?.pro ?? 0} />
          <Stat label="Active Elite" value={m?.elite ?? 0} />
          <Stat
            label="Revenue (30d)"
            value={`$${(m?.revenue30d ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            tone="bull"
          />
          <Stat
            label="Expiring (7d)"
            value={m?.expiringSoon ?? 0}
            tone={(m?.expiringSoon ?? 0) > 0 ? "warn" : undefined}
          />
        </div>
      </SectionState>
    </Section>
  );
}
