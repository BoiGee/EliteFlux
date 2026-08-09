import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { listAdminAudit } from "@/lib/admin.functions";
import { Section, SectionState } from "./Section";

const LABELS: Record<string, string> = {
  "payment.approve": "approved a payment",
  "payment.reject": "rejected a payment",
  "payment.recheck": "re-checked a payment",
  "plan.override": "changed a plan",
  "role.grant_admin": "granted admin access",
  "role.revoke_admin": "revoked admin access",
  "killswitch.on": "halted all automation",
  "killswitch.off": "resumed automation",
  "platform.controls": "changed launch controls",
  "job.run": "ran a background job",
};

export function AuditPanel() {
  const get = useServerFn(listAdminAudit);
  const q = useQuery({ queryKey: ["admin", "audit"], queryFn: () => get() });
  const rows = q.data?.rows ?? [];

  return (
    <Section title="Recent admin activity" icon={<History className="w-4 h-4 text-primary" />}>
      <SectionState
        isLoading={q.isPending}
        isError={q.isError}
        isEmpty={!rows.length}
        emptyText="No admin actions recorded yet."
        onRetry={() => q.refetch()}
      >
        <ul className="space-y-1.5 text-xs">
          {rows.map((r: any) => (
            <li key={r.id} className="flex flex-wrap gap-x-2 border-b border-border/30 pb-1.5">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              <span className="font-semibold">{r.actorEmail}</span>
              <span>{LABELS[r.action] ?? r.action}</span>
              {r.targetEmail && <span className="text-primary">→ {r.targetEmail}</span>}
              {r.target_id && !r.targetEmail && <span className="text-muted-foreground">({r.target_id})</span>}
            </li>
          ))}
        </ul>
      </SectionState>
    </Section>
  );
}
