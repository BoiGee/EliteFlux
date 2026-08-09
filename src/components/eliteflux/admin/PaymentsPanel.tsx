import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Check, X } from "lucide-react";
import { listAdminPayments, decidePayment } from "@/lib/admin.functions";
import { Section, SectionState } from "./Section";

const STATUSES = ["pending", "all", "verified", "rejected", "expired"] as const;

export function PaymentsPanel({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const qc = useQueryClient();
  const list = useServerFn(listAdminPayments);
  const decide = useServerFn(decidePayment);
  const [status, setStatus] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(25);

  const q = useQuery({
    queryKey: ["admin", "payments", status, search, limit],
    queryFn: () => list({ data: { status, search: search || undefined, limit } }),
  });

  const act = useMutation({
    mutationFn: (vars: { id: string; decision: "approve" | "reject" | "recheck"; reason?: string }) =>
      decide({ data: vars }),
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data?.rows ?? [];

  return (
    <Section
      title="Payments"
      icon={<CreditCard className="w-4 h-4 text-primary" />}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or TXID"
            className="h-8 px-3 rounded-md bg-surface border border-border text-xs outline-none focus:border-primary/60 w-44"
          />
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`text-[11px] px-2.5 py-1 rounded-md border capitalize ${
                  status === s ? "border-primary text-white" : "border-border text-muted-foreground hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <SectionState
        isLoading={q.isPending}
        isError={q.isError}
        isEmpty={!rows.length}
        emptyText={status === "pending" ? "No payments waiting on you." : "No payments match this filter."}
        onRetry={() => q.refetch()}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">User</th>
                <th className="pr-3">Plan</th>
                <th className="pr-3">Expected</th>
                <th className="pr-3">Detected</th>
                <th className="pr-3">Submitted</th>
                <th className="pr-3">Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: any) => (
                <tr key={p.id} className="border-t border-border/40 align-top">
                  <td className="py-2 pr-3">
                    <button onClick={() => onOpenUser(p.user_id)} className="text-primary hover:underline">
                      {p.email ?? p.user_id.slice(0, 8)}
                    </button>
                    {p.provider_ref && (
                      <div className="font-mono text-[10px] text-muted-foreground">{p.provider_ref.slice(0, 14)}…</div>
                    )}
                    {p.notes && <div className="text-[10px] text-muted-foreground max-w-[240px]">{p.notes}</div>}
                  </td>
                  <td className="pr-3 uppercase">
                    {p.tier}
                    <div className="text-[10px] text-muted-foreground lowercase">{p.cycle}</div>
                  </td>
                  <td className="pr-3">${Number(p.expected_amount).toFixed(2)}</td>
                  <td className="pr-3">{p.detected_amount ? `$${Number(p.detected_amount).toFixed(2)}` : "—"}</td>
                  <td className="pr-3">{new Date(p.created_at).toLocaleString()}</td>
                  <td className="pr-3">
                    <span
                      className={
                        p.status === "verified"
                          ? "text-bull"
                          : p.status === "pending"
                            ? "text-warn"
                            : "text-bear"
                      }
                    >
                      {p.status}
                    </span>
                    {p.verified_at && (
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(p.verified_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="space-x-1 whitespace-nowrap">
                    {p.status !== "verified" && (
                      <>
                        <button
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: p.id, decision: "recheck" })}
                          className="px-2 py-1 rounded bg-surface border border-border/60 hover:border-primary/60 inline-flex items-center gap-1"
                          title="Re-check this payment with Paystack"
                        >
                          <RefreshCw className="w-3 h-3" /> Re-check
                        </button>
                        <button
                          disabled={act.isPending}
                          onClick={() => {
                            if (!confirm("Approve this payment and activate the plan?")) return;
                            act.mutate({ id: p.id, decision: "approve" });
                          }}
                          className="px-2 py-1 rounded bg-bull/15 text-bull hover:bg-bull/25 inline-flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Approve &amp; activate
                        </button>
                        <button
                          disabled={act.isPending}
                          onClick={() => {
                            const reason = prompt("Reason for rejecting (shown in the audit log):") ?? undefined;
                            if (reason === undefined) return;
                            act.mutate({ id: p.id, decision: "reject", reason });
                          }}
                          className="px-2 py-1 rounded bg-bear/15 text-bear hover:bg-bear/25 inline-flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
          <span>
            Showing {rows.length} of {q.data?.total ?? 0}
          </span>
          {rows.length < (q.data?.total ?? 0) && (
            <button onClick={() => setLimit((l) => l + 50)} className="px-3 py-1 rounded border border-border hover:text-white">
              Load more
            </button>
          )}
        </div>
      </SectionState>
    </Section>
  );
}
