import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getNotifications, markAlertsRead } from "@/lib/alerts.functions";
import { useAuth } from "@/lib/auth";

export function NotificationBell() {
  const { user } = useAuth();
  const load = useServerFn(getNotifications);
  const markRead = useServerFn(markAlertsRead);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => load({}),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const readM = useMutation({
    mutationFn: () => markRead({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = q.data?.unread ?? 0;
  const recent = q.data?.recent ?? [];

  if (!user) {
    return (
      <Link
        to="/alerts"
        title="Intelligence alerts"
        className="w-10 h-10 grid place-items-center rounded-lg glass-panel hover:border-primary/40 transition"
      >
        <Bell className="w-4 h-4" />
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intelligence alerts"
        className="relative w-10 h-10 grid place-items-center rounded-lg glass-panel hover:border-primary/40 transition"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-gradient-primary text-white text-[10px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-50 glass-panel rounded-xl p-3 border border-border/60 shadow-xl">
            <div className="flex items-center mb-2">
              <p className="text-xs font-bold">Triggered alerts</p>
              {unread > 0 && (
                <button
                  onClick={() => readM.mutate()}
                  className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-4 text-center">
                Nothing fired yet. Alerts are evaluated every 5 minutes.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                {recent.map((h) => {
                  const p = (h.payload ?? {}) as { name?: string; message?: string };
                  return (
                    <li
                      key={h.id}
                      className={`px-2.5 py-2 rounded-lg border ${
                        h.read ? "bg-surface/40 border-border/40" : "bg-primary/10 border-primary/40"
                      }`}
                    >
                      <p className="text-xs font-semibold truncate">{p.name ?? "Alert"}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{p.message ?? "Condition met."}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {new Date(h.fired_at).toLocaleString()}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/alerts"
              onClick={() => setOpen(false)}
              className="mt-2 block text-center text-[11px] font-semibold text-primary hover:underline"
            >
              Manage alerts
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
