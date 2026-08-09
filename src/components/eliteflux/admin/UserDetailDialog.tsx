import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { getUserDetail } from "@/lib/admin.functions";

/** Everything about one customer, without hunting across four tables. */
export function UserDetailDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const get = useServerFn(getUserDetail);
  const q = useQuery({ queryKey: ["admin", "user", userId], queryFn: () => get({ data: { userId } }) });
  const d = q.data;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="glass-card w-full max-w-2xl max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-border/50">
          <h3 className="font-bold text-sm">{d?.profile?.email ?? "Customer"}</h3>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 text-xs">
          {q.isError && <p className="text-bear">Could not load this customer.</p>}
          {q.isPending && <p className="text-muted-foreground">Loading…</p>}

          {d && (
            <>
              <Block title="Account">
                <Row k="Joined" v={d.profile?.created_at ? new Date(d.profile.created_at).toLocaleString() : "—"} />
                <Row k="Risk sensitivity" v={d.profile?.risk_sensitivity ?? "—"} />
                <Row k="Onboarded" v={d.profile?.onboarded_at ? "yes" : "no"} />
                <Row k="Read-only keys enforced" v={d.profile?.readonly_keys_only ? "yes" : "no"} />
                <Row k="Admin" v={d.isAdmin ? "yes" : "no"} />
              </Block>

              <Block title="Plan">
                <Row k="Tier" v={(d.subscription?.tier ?? "free").toUpperCase()} />
                <Row k="Status" v={d.subscription?.status ?? "—"} />
                <Row
                  k="Period end"
                  v={d.subscription?.current_period_end ? new Date(d.subscription.current_period_end).toLocaleString() : "—"}
                />
              </Block>

              <Block title="Autopilot">
                {d.autopilot ? (
                  <>
                    <Row k="Level" v={d.autopilot.level} />
                    <Row k="Armed" v={d.autopilot.armed ? "yes" : "no"} />
                    <Row k="Paper mode" v={d.autopilot.paper_mode ? "yes" : "no"} />
                    <Row k="Kill switch" v={d.autopilot.kill_switch ? "on" : "off"} />
                    <Row k="Max trade" v={`$${d.autopilot.max_trade_usd}`} />
                  </>
                ) : (
                  <p className="text-muted-foreground">Not configured.</p>
                )}
              </Block>

              <Block title="Connected accounts">
                {!d.exchanges.length && !d.wallets.length && <p className="text-muted-foreground">None connected.</p>}
                {d.exchanges.map((e: any) => (
                  <Row key={e.id} k={`${e.venue} (${e.permission})`} v={`${e.status}${e.last_error ? ` — ${e.last_error}` : ""}`} />
                ))}
                {d.wallets.map((w: any) => (
                  <Row key={w.id} k={`${w.chain} wallet`} v={w.status} />
                ))}
              </Block>

              <Block title="Payments">
                {!d.payments.length && <p className="text-muted-foreground">No payments.</p>}
                {d.payments.map((p: any) => (
                  <Row
                    key={p.id}
                    k={`${new Date(p.created_at).toLocaleDateString()} · ${p.tier}/${p.cycle}`}
                    v={`$${Number(p.expected_amount).toFixed(2)} · ${p.status}`}
                  />
                ))}
              </Block>

              <Block title="Recent alert deliveries">
                {!d.deliveries.length && <p className="text-muted-foreground">No deliveries yet.</p>}
                {d.deliveries.map((x: any, i: number) => (
                  <Row
                    key={i}
                    k={`${new Date(x.created_at).toLocaleString()} · ${x.channel}`}
                    v={x.status === "failed" ? `failed — ${x.error ?? "unknown"}` : x.status}
                  />
                ))}
              </Block>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/30 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
