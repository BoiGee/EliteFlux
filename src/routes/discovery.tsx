import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock, Power, Radar, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TopBar } from "@/components/eliteflux/TopBar";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";
import {
  DISCOVERY_GUARDRAIL_BOUNDS,
  DISCOVERY_NETWORKS,
  DISCOVERY_NETWORK_LABEL,
  DISCOVERY_RISK_DISCLOSURE,
} from "@/lib/autonomy";
import {
  acceptDiscoveryDisclosure,
  getDiscoveryFeed,
  getDiscoverySettings,
  updateDiscoverySettings,
} from "@/lib/discovery.functions";

export const Route = createFileRoute("/discovery")({
  head: () => ({
    meta: [
      { title: "Token Discovery — Early/Unlisted Token Screening" },
      {
        name: "description",
        content:
          "Real-time screening of brand-new DEX tokens before they reach any centralized exchange — safety-gated, paper-mode only.",
      },
      { property: "og:title", content: "EliteFlux Token Discovery" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: DiscoveryPage,
});

const NUM_FIELDS = [
  { key: "min_safety_score", label: "Minimum safety score", suffix: "score" },
  { key: "max_position_usd", label: "Max paper position size", suffix: "USD" },
  { key: "total_allocation_budget_usd", label: "Total paper allocation budget", suffix: "USD" },
  { key: "max_open_positions", label: "Max open positions", suffix: "positions" },
] as const;

type NumKey = (typeof NUM_FIELDS)[number]["key"];

function DiscoveryPage() {
  const { user, tier, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const fetchSettings = useServerFn(getDiscoverySettings);
  const fetchFeed = useServerFn(getDiscoveryFeed);
  const update = useServerFn(updateDiscoverySettings);
  const acceptDisclosure = useServerFn(acceptDiscoveryDisclosure);

  const eliteOnly = tier !== "elite";

  const q = useQuery({
    queryKey: ["discovery", "settings"],
    queryFn: () => fetchSettings(),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const feedQ = useQuery({
    queryKey: ["discovery", "feed"],
    queryFn: () => fetchFeed(),
    enabled: !!user && !eliteOnly,
    refetchInterval: 60_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["discovery"] });

  const settings = q.data;

  const [draft, setDraft] = useState<Record<NumKey, string> | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [networks, setNetworks] = useState<string[]>([]);

  useEffect(() => {
    if (settings && !draft) {
      setDraft(Object.fromEntries(NUM_FIELDS.map((f) => [f.key, String(settings[f.key])])) as Record<NumKey, string>);
      setNetworks(settings.allowed_networks ?? []);
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

  const acceptM = useMutation({
    mutationFn: () => acceptDisclosure({ data: { accept: true } }),
    onSuccess: () => {
      toast.success("Disclosure accepted.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGuardrails = () => {
    if (!draft) return;
    const patch: Record<string, unknown> = { allowed_networks: networks };
    for (const f of NUM_FIELDS) {
      const n = Number(draft[f.key]);
      const b = DISCOVERY_GUARDRAIL_BOUNDS[f.key];
      if (!Number.isFinite(n) || n < b.min || n > b.max) {
        toast.error(`${f.label} must be between ${b.min} and ${b.max}.`);
        return;
      }
      patch[f.key] = n;
    }
    updateM.mutate(patch);
  };

  const tokens = useMemo(() => feedQ.data?.tokens ?? [], [feedQ.data]);
  const actions = useMemo(() => feedQ.data?.actions ?? [], [feedQ.data]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="p-4 sm:p-5 lg:p-7 space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Radar className="w-6 h-6 text-primary" />
            Token <span className="text-gradient">Discovery</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Screens brand-new tokens on DEXs before they reach any centralized exchange — contract/mint safety,
            liquidity and holder concentration, scored 0-100. Paper-mode only: no real order is ever placed. A
            separate, stricter feature from Autopilot — most new, not-yet-listed tokens are scams or rug pulls.
          </p>
        </div>

        {eliteOnly && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 flex items-center gap-3">
            <Lock className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm flex-1">Token Discovery is an Elite feature.</p>
            <Link to="/pricing">
              <Button size="sm">Compare plans</Button>
            </Link>
          </div>
        )}

        {settings?.kill_switch && (
          <div className="rounded-xl border border-bear/50 bg-bear/10 p-4 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-bear shrink-0" />
            <p className="text-sm flex-1">Kill switch is on. No new paper positions will be opened until you turn it off.</p>
            <Button size="sm" variant="outline" onClick={() => updateM.mutate({ kill_switch: false })}>
              Turn off
            </Button>
          </div>
        )}

        {/* Opt in */}
        <section className="glass-panel rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-surface-2/50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Opt in to Token Discovery</p>
              <p className="text-xs text-muted-foreground">
                Separate consent from Autopilot — covers unverified DEX tokens, not the curated universe.
              </p>
            </div>
            <Switch
              disabled={eliteOnly}
              checked={!!settings?.opted_in}
              onCheckedChange={(v) => updateM.mutate({ opted_in: v })}
            />
          </div>
        </section>

        {/* Guardrails */}
        {settings?.opted_in && (
          <section className="glass-panel rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Guardrails</h2>
            <p className="text-xs text-muted-foreground">
              Hard limits enforced on our side, separate from Autopilot's own guardrails — calibrated for
              unverified, two-day-old tokens, not established coins.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
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

            <div className="space-y-1.5">
              <Label className="text-xs">Networks (none selected = all covered networks)</Label>
              <div className="flex flex-wrap gap-2">
                {DISCOVERY_NETWORKS.map((n) => {
                  const active = networks.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNetworks((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]))}
                      className={`text-xs px-3 py-1.5 rounded-md ring-1 transition ${
                        active ? "bg-primary/15 ring-primary text-primary" : "ring-border/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {DISCOVERY_NETWORK_LABEL[n] ?? n}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={saveGuardrails} disabled={updateM.isPending}>
              Save guardrails
            </Button>
          </section>
        )}

        {/* Arming */}
        {settings?.opted_in && (
          <section className="glass-panel rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Power className={`w-4 h-4 ${settings.armed ? "text-bull" : "text-muted-foreground"}`} />
              <h2 className="font-semibold">{settings.armed ? "Discovery is armed (paper mode)" : "Arm paper trading"}</h2>
            </div>

            {settings.armed ? (
              <Button variant="destructive" onClick={() => updateM.mutate({ armed: false })}>
                <Power className="w-4 h-4 mr-2" /> Disarm
              </Button>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {DISCOVERY_RISK_DISCLOSURE.map((line) => (
                    <li key={line} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                      <span className="text-primary">•</span> {line}
                    </li>
                  ))}
                </ul>
                {!settings.disclosure_accepted_at ? (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        className="accent-[var(--neon-blue)]"
                      />
                      I have read and accept the discovery risk disclosure.
                    </label>
                    <Button disabled={!accepted || acceptM.isPending} onClick={() => acceptM.mutate()}>
                      Accept disclosure
                    </Button>
                  </>
                ) : (
                  <Button disabled={updateM.isPending} onClick={() => updateM.mutate({ armed: true })}>
                    Arm paper trading
                  </Button>
                )}
              </>
            )}
          </section>
        )}

        {/* Feed */}
        <section className="glass-panel rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Live feed — safety-gate passed</h2>
          </div>
          {eliteOnly ? (
            <p className="text-sm text-muted-foreground">Upgrade to Elite to see the live feed.</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has cleared the safety gate recently. Most new tokens don't — that's expected, not a bug.
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t: any) => (
                <div key={t.id} className="rounded-lg bg-surface-2/50 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-primary/20 text-primary">
                      {t.network}
                    </span>
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="text-xs text-muted-foreground">{t.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Opportunity {t.opportunity_score} · Safety {t.safety_score}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{t.rationale}</p>
                  <div className="text-xs text-muted-foreground">
                    Liquidity ${Number(t.last_liquidity_usd ?? 0).toLocaleString()} · Top-10 holders{" "}
                    {t.top10_holder_pct ?? "—"}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Paper position history */}
        {actions.length > 0 && (
          <section className="glass-panel rounded-xl p-5 space-y-3">
            <h2 className="font-semibold">Paper position history</h2>
            <div className="space-y-1.5">
              {actions.map((a: any) => (
                <div key={a.id} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span className="font-semibold text-foreground/80">{a.symbol}</span>
                    <span>{a.state}</span>
                    <span className="text-[10px] px-1.5 rounded bg-surface-2">paper</span>
                    {a.notional_usd && <span>${Number(a.notional_usd).toFixed(0)}</span>}
                    <span className="ml-auto">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  {a.state === "blocked" && a.blocked_reason && (
                    <p className="text-[11px] text-warn/90 pl-0.5">Blocked: {a.blocked_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {settings?.opted_in && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Every position here is simulated. EliteFlux has no on-chain
            wallet-signing infrastructure, so nothing here can touch real funds.
          </p>
        )}

        <SiteFooter contained={false} />
      </main>
    </div>
  );
}
