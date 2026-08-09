import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bell, BellOff, Play, Plus, Trash2, CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CHANNELS_BY_TIER, type AlertChannel } from "@/lib/tier-matrix";
import {
  createAlert,
  deleteAlert,
  listAlertHistory,
  listAlerts,
  markAlertsRead,
  runMyAlertsNow,
  toggleAlert,
} from "@/lib/alerts.functions";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — EliteFlux Intelligence Triggers" },
      {
        name: "description",
        content:
          "Create live crypto intelligence alerts on Elite Flux Score, whale activity, sentiment, narratives, exit pressure, momentum and price levels.",
      },
      { property: "og:title", content: "EliteFlux Alerts" },
      {
        property: "og:description",
        content: "Automated crypto intelligence triggers across whale, sentiment, narrative and momentum layers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AlertsPage,
});

const TRIGGERS = [
  { key: "flux_score", label: "Elite Flux Score", needsSymbol: false, unit: "score" },
  { key: "whale_spike", label: "Whale Activity", needsSymbol: false, unit: "score" },
  { key: "sentiment_shift", label: "Sentiment", needsSymbol: false, unit: "score" },
  { key: "narrative_surge", label: "Narrative Strength", needsSymbol: false, unit: "score" },
  { key: "exit_pressure", label: "Exit Pressure", needsSymbol: false, unit: "score" },
  { key: "momentum_change", label: "Momentum Ignition", needsSymbol: false, unit: "score" },
  { key: "price_threshold", label: "Price Level", needsSymbol: true, unit: "USD" },
] as const;

type TriggerKey = (typeof TRIGGERS)[number]["key"];

function AlertsPage() {
  const { user, tier, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const fetchAlerts = useServerFn(listAlerts);
  const fetchHistory = useServerFn(listAlertHistory);
  const create = useServerFn(createAlert);
  const toggle = useServerFn(toggleAlert);
  const remove = useServerFn(deleteAlert);
  const runNow = useServerFn(runMyAlertsNow);
  const markRead = useServerFn(markAlertsRead);

  const alertsQ = useQuery({ queryKey: ["alerts"], queryFn: () => fetchAlerts(), enabled: !!user });
  const historyQ = useQuery({
    queryKey: ["alert-history"],
    queryFn: () => fetchHistory(),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<TriggerKey>("flux_score");
  const [symbol, setSymbol] = useState("");
  const [threshold, setThreshold] = useState("70");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [flash, setFlash] = useState<string | null>(null);
  const [channels, setChannels] = useState<AlertChannel[]>(["in_app"]);
  const allowedChannels = CHANNELS_BY_TIER[tier];

  const meta = TRIGGERS.find((t) => t.key === trigger)!;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["alerts"] });
    qc.invalidateQueries({ queryKey: ["alert-history"] });
  };

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: name.trim() || `${meta.label} trigger`,
          trigger_type: trigger,
          symbol: symbol.trim() ? symbol.trim().toUpperCase() : null,
          threshold: threshold === "" ? null : Number(threshold),
          direction,
          channels,
        },
      }),
    onSuccess: (r) => {
      setFlash(r.message);
      if (r.ok) setName("");
      invalidate();
    },
  });

  const runM = useMutation({
    mutationFn: () => runNow({}),
    onSuccess: (r) => {
      setFlash(r.message);
      invalidate();
    },
  });

  const alerts = alertsQ.data ?? [];
  const history = historyQ.data ?? [];
  const unread = history.filter((h) => !h.read).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/" className="w-9 h-9 grid place-items-center rounded-lg glass-panel hover:border-primary/40">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Intelligence Alerts
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Evaluated automatically against live market cognition. Plan: {tier.toUpperCase()}
            </p>
          </div>
          <button
            onClick={() => runM.mutate()}
            disabled={runM.isPending}
            className="ml-auto flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-primary text-white text-xs font-semibold disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5" /> {runM.isPending ? "Evaluating…" : "Evaluate now"}
          </button>
        </div>

        {flash && (
          <div className="mb-6 px-4 py-3 rounded-lg glass-panel text-sm text-foreground/90">{flash}</div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Create + list */}
          <section className="space-y-6">
            <div className="glass-panel rounded-xl p-5">
              <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> New alert
              </h2>
              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alert name"
                  className="w-full h-10 px-3 rounded-lg bg-surface/60 border border-border/60 text-sm focus:outline-none focus:border-primary/60"
                />
                <select
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value as TriggerKey)}
                  className="w-full h-10 px-3 rounded-lg bg-surface/60 border border-border/60 text-sm"
                >
                  {TRIGGERS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder={meta.needsSymbol ? "BTC" : "Symbol (opt)"}
                    className="h-10 px-3 rounded-lg bg-surface/60 border border-border/60 text-sm uppercase"
                  />
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "above" | "below")}
                    className="h-10 px-2 rounded-lg bg-surface/60 border border-border/60 text-sm"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                  <input
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    inputMode="decimal"
                    placeholder={meta.unit}
                    className="h-10 px-3 rounded-lg bg-surface/60 border border-border/60 text-sm"
                  />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Delivery channels</p>
                  <div className="flex flex-wrap gap-2">
                    {(["in_app", "email", "telegram", "webhook"] as AlertChannel[]).map((c) => {
                      const allowed = allowedChannels.includes(c);
                      const on = channels.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          disabled={!allowed || c === "in_app"}
                          onClick={() =>
                            setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
                          }
                          className={`h-8 px-3 rounded-lg text-[11px] font-semibold border transition ${
                            on
                              ? "border-primary/60 bg-primary/15 text-foreground"
                              : "border-border/60 bg-surface/40 text-muted-foreground"
                          } ${!allowed ? "opacity-40 cursor-not-allowed" : ""}`}
                          title={allowed ? "" : "Requires a higher plan"}
                        >
                          {c === "in_app" ? "In-app" : c === "email" ? "Email" : c === "telegram" ? "Telegram" : "Webhook"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground/80">
                    Email needs Pro · Telegram and webhooks need Elite. Configure destinations on your account page.
                  </p>
                </div>
                <button
                  onClick={() => createM.mutate()}
                  disabled={createM.isPending}
                  className="w-full h-10 rounded-lg bg-gradient-cyber text-background text-sm font-bold disabled:opacity-60"
                >
                  {createM.isPending ? "Creating…" : "Create alert"}
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-5">
              <h2 className="text-sm font-bold mb-4">Your alerts ({alerts.length})</h2>
              {alertsQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {!alertsQ.isLoading && alerts.length === 0 && (
                <p className="text-xs text-muted-foreground">No alerts yet — create your first trigger above.</p>
              )}
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface/50 border border-border/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{a.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {TRIGGERS.find((t) => t.key === a.trigger_type)?.label ?? a.trigger_type}
                        {a.symbol ? ` · ${a.symbol}` : ""} · {a.direction ?? "above"} {a.threshold ?? "—"}
                        {a.last_triggered_at
                          ? ` · last fired ${new Date(a.last_triggered_at).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <button
                      title={a.enabled ? "Pause" : "Enable"}
                      onClick={async () => {
                        await toggle({ data: { id: a.id, enabled: !a.enabled } });
                        invalidate();
                      }}
                      className={`w-8 h-8 grid place-items-center rounded-lg border ${
                        a.enabled ? "border-bull/40 text-bull" : "border-border/60 text-muted-foreground"
                      }`}
                    >
                      {a.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>
                    <button
                      title="Delete"
                      onClick={async () => {
                        await remove({ data: { id: a.id } });
                        invalidate();
                      }}
                      className="w-8 h-8 grid place-items-center rounded-lg border border-bear/40 text-bear"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* History */}
          <section className="glass-panel rounded-xl p-5 h-fit">
            <div className="flex items-center mb-4">
              <h2 className="text-sm font-bold">
                Triggered feed {unread > 0 && <span className="text-primary">· {unread} new</span>}
              </h2>
              {unread > 0 && (
                <button
                  onClick={async () => {
                    await markRead({});
                    invalidate();
                  }}
                  className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>
            {history.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nothing fired yet. Alerts are evaluated automatically every 15 minutes.
              </p>
            )}
            <ul className="space-y-2 max-h-[32rem] overflow-y-auto">
              {history.map((h) => {
                const p = (h.payload ?? {}) as { message?: string; name?: string };
                return (
                  <li
                    key={h.id}
                    className={`px-3 py-2.5 rounded-lg border ${
                      h.read ? "bg-surface/40 border-border/40" : "bg-primary/10 border-primary/40"
                    }`}
                  >
                    <p className="text-sm font-semibold">{p.name ?? "Alert"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.message ?? "Condition met."}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {new Date(h.fired_at).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
