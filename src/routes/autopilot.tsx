import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Inbox, Lock, Power, ShieldAlert, Sliders, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TopBar } from "@/components/eliteflux/TopBar";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";
import {
  ARM_PHRASE,
  AUTONOMY_LEVELS,
  GUARDRAIL_BOUNDS,
  RISK_DISCLOSURE,
  type AutonomyLevel,
} from "@/lib/autonomy";
import { armAutopilot, decideAction, getAutopilot, setKillSwitch, updateAutopilot } from "@/lib/autopilot.functions";

export const Route = createFileRoute("/autopilot")({
  head: () => ({
    meta: [
      { title: "Autopilot — Decide How Much Flux Does" },
      {
        name: "description",
        content:
          "Choose an autonomy level from observe to autopilot, set hard guardrails, approve queued actions and keep a kill switch one tap away.",
      },
      { property: "og:title", content: "EliteFlux Autopilot" },
      {
        property: "og:description",
        content: "A four-step autonomy dial with position caps, conviction floors and a drawdown circuit breaker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutopilotPage,
});

const NUM_FIELDS = [
  { key: "max_trade_pct", label: "Max size per trade", suffix: "% of portfolio" },
  { key: "max_trade_usd", label: "Max size per trade", suffix: "USD" },
  { key: "max_trades_per_day", label: "Max trades per 24h", suffix: "trades" },
  { key: "max_daily_usd", label: "Max traded per 24h", suffix: "USD" },
  { key: "min_conviction", label: "Conviction floor", suffix: "score" },
  { key: "cooldown_hours", label: "Cooldown per asset", suffix: "hours" },
  { key: "drawdown_breaker_pct", label: "Auto-disarm drawdown", suffix: "%" },
] as const;

type NumKey = (typeof NUM_FIELDS)[number]["key"];

function AutopilotPage() {
  const { user, tier, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const fetchState = useServerFn(getAutopilot);
  const update = useServerFn(updateAutopilot);
  const arm = useServerFn(armAutopilot);
  const kill = useServerFn(setKillSwitch);
  const decide = useServerFn(decideAction);

  const q = useQuery({
    queryKey: ["autopilot"],
    queryFn: () => fetchState(),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["autopilot"] });

  const settings = q.data?.settings;
  const eliteOnly = tier !== "elite";

  const [draft, setDraft] = useState<Record<NumKey, string> | null>(null);
  const [phrase, setPhrase] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (settings && !draft) {
      setDraft(
        Object.fromEntries(NUM_FIELDS.map((f) => [f.key, String(settings[f.key])])) as Record<NumKey, string>,
      );
    }
  }, [settings, draft]);

  const updateM = useMutation({
    mutationFn: (patch: Record<string, unknown>) => update({ data: patch }),
    onSuccess: () => {
      toast.success("Settings saved.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const armM = useMutation({
    mutationFn: () => arm({ data: { phrase, accept_disclosure: accepted } }),
    onSuccess: () => {
      setPhrase("");
      toast.success("Autopilot armed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const killM = useMutation({
    mutationFn: (on: boolean) => kill({ data: { on } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const decideM = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decide({ data: v }),
    onSuccess: () => {
      toast.success("Done.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = useMemo(
    () => (q.data?.actions ?? []).filter((a) => a.state === "proposed"),
    [q.data],
  );
  const recent = useMemo(
    () => (q.data?.actions ?? []).filter((a) => a.state !== "proposed").slice(0, 12),
    [q.data],
  );

  const saveGuardrails = () => {
    if (!draft) return;
    const patch: Record<string, number> = {};
    for (const f of NUM_FIELDS) {
      const n = Number(draft[f.key]);
      const b = GUARDRAIL_BOUNDS[f.key];
      if (!Number.isFinite(n) || n < b.min || n > b.max) {
        toast.error(`${f.label} must be between ${b.min} and ${b.max}.`);
        return;
      }
      patch[f.key] = n;
    }
    updateM.mutate(patch);
  };

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="p-4 sm:p-5 lg:p-7 space-y-6 max-w-5xl mx-auto">
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Flux <span className="text-gradient">Autonomy</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            You decide how much Flux, your AI Coach, is allowed to do — from answering questions to acting inside hard limits
            you set.
          </p>
        </div>

        {settings?.kill_switch && (
          <div className="rounded-xl border border-bear/50 bg-bear/10 p-4 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-bear shrink-0" />
            <p className="text-sm flex-1">Kill switch is on. Nothing will be executed until you turn it off.</p>
            <Button size="sm" variant="outline" onClick={() => killM.mutate(false)}>
              Turn off
            </Button>
          </div>
        )}

        {/* Paper mode simulates fills with no real exchange, so this doesn't
            apply there — matches the same condition armAutopilot itself
            checks server-side before allowing a live arm. */}
        {!settings?.paper_mode && q.data && !q.data.hasTradeConnection && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 flex items-center gap-3">
            <Wallet className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm flex-1">
              {q.data.hasAnyConnection
                ? "None of your connected accounts have trading permission enabled — Autopilot can't place live trades yet."
                : "Connect an exchange account with trading permission before Autopilot can do anything live."}
            </p>
            <Link to="/portfolio">
              <Button size="sm">Connect an exchange</Button>
            </Link>
          </div>
        )}

        {/* Autonomy dial */}
        <section className="glass-panel rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Autonomy level</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {AUTONOMY_LEVELS.map((l) => {
              const active = settings?.level === l.key;
              const locked = l.key === "autopilot" && eliteOnly;
              return (
                <button
                  key={l.key}
                  disabled={locked || updateM.isPending}
                  aria-pressed={active}
                  onClick={() => updateM.mutate({ level: l.key as AutonomyLevel })}
                  className={`text-left rounded-xl p-4 transition ring-1 ${
                    active
                      ? "bg-primary/15 ring-primary"
                      : "bg-surface-2/50 ring-border/50 hover:bg-surface-2 disabled:opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">{l.index}</span>
                    <span className="font-semibold">{l.name}</span>
                    {locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    {active && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{l.blurb}</p>
                </button>
              );
            })}
          </div>
          {eliteOnly && (
            <p className="text-xs text-muted-foreground">
              Autopilot is an Elite feature.{" "}
              <Link to="/pricing" className="text-primary hover:underline">
                Compare plans
              </Link>
            </p>
          )}
        </section>

        {/* Guardrails */}
        <section className="glass-panel rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Guardrails</h2>
          <p className="text-xs text-muted-foreground">
            Hard limits enforced on our side. Flux cannot exceed them, even if a signal is very strong.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {NUM_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key} className="text-xs">
                  {f.label} <span className="text-muted-foreground font-normal">({f.suffix})</span>
                </Label>
                <Input
                  id={f.key}
                  inputMode="decimal"
                  value={draft?.[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => (d ? { ...d, [f.key]: e.target.value } : d))}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-2/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Paper mode</p>
              <p className="text-xs text-muted-foreground">Simulate every action instead of placing real orders.</p>
            </div>
            <Switch
              checked={!!settings?.paper_mode}
              onCheckedChange={(v) => updateM.mutate({ paper_mode: v })}
            />
          </div>

          <Button onClick={saveGuardrails} disabled={updateM.isPending}>
            Save guardrails
          </Button>
        </section>

        {/* Arming */}
        {settings?.level === "autopilot" && (
          <section className="glass-panel rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Power className={`w-4 h-4 ${settings.armed ? "text-bull" : "text-muted-foreground"}`} />
              <h2 className="font-semibold">{settings.armed ? "Autopilot is armed" : "Arm autopilot"}</h2>
            </div>

            {settings.armed ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Running in {settings.paper_mode ? "paper" : "live"} mode since{" "}
                  {settings.armed_at ? new Date(settings.armed_at).toLocaleString() : "—"}.
                </p>
                <Button variant="destructive" onClick={() => killM.mutate(true)}>
                  <Power className="w-4 h-4 mr-2" /> Kill switch — stop everything
                </Button>
              </>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {RISK_DISCLOSURE.map((line) => (
                    <li key={line} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                      <span className="text-primary">•</span> {line}
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="accent-[var(--neon-blue)]"
                  />
                  I have read and accept the risk disclosure.
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="phrase" className="text-xs">
                    Type <span className="font-mono font-bold">{ARM_PHRASE}</span> to confirm
                  </Label>
                  <Input id="phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
                </div>
                <Button
                  disabled={!accepted || phrase.trim().toUpperCase() !== ARM_PHRASE || armM.isPending}
                  onClick={() => armM.mutate()}
                >
                  Arm autopilot
                </Button>
              </>
            )}
          </section>
        )}

        {/* Action inbox */}
        <section className="glass-panel rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Action inbox</h2>
            {pending.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                {pending.length}
              </span>
            )}
          </div>

          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No actions waiting. Proposals appear here whenever Flux sees something that clears your conviction
              floor.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((a) => (
                <div key={a.id} className="rounded-lg bg-surface-2/50 p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        a.kind === "buy" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
                      }`}
                    >
                      {a.kind}
                    </span>
                    <span className="font-semibold">{a.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.size_pct ? `${Number(a.size_pct).toFixed(1)}% · ` : ""}
                      {a.notional_usd ? `$${Number(a.notional_usd).toFixed(0)}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">Conviction {a.conviction ?? "—"}</span>
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{a.rationale}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decideM.mutate({ id: a.id, approve: true })} disabled={decideM.isPending}>
                      <Check className="w-4 h-4 mr-1.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decideM.mutate({ id: a.id, approve: false })}
                      disabled={decideM.isPending}
                    >
                      <X className="w-4 h-4 mr-1.5" /> Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recent.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Recent</p>
              {recent.map((a) => (
                <div key={a.id} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/80 uppercase">{a.kind}</span>
                    <span className="font-semibold text-foreground/80">{a.symbol}</span>
                    <span>{a.state}</span>
                    {a.paper && <span className="text-[10px] px-1.5 rounded bg-surface-2">paper</span>}
                    <span className="ml-auto">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  {a.state === "blocked" && a.blocked_reason && (
                    <p className="text-[11px] text-warn/90 pl-0.5">Blocked: {a.blocked_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="text-center">
          <Link to="/portfolio" className="text-sm text-primary hover:underline">
            Manage connected accounts →
          </Link>
        </div>

        <SiteFooter contained={false} />
      </main>
    </div>
  );
}
