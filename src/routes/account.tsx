import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Crown, LogOut, Plus, RefreshCw, Trash2, XCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Tier } from "@/lib/auth";
import { verifyPayment } from "@/lib/payments.functions";
import { cancelSubscription } from "@/lib/subscription.functions";
import { updateNotificationSettings } from "@/lib/alerts.functions";
import { CoachSettings } from "@/components/eliteflux/CoachSettings";
import { TelegramLinkCard } from "@/components/eliteflux/TelegramLinkCard";
import { TIER_DISPLAY_NAME } from "@/lib/tier-matrix";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — EliteFlux" }] }),
  component: AccountPage,
});

const TIER_META: Record<Tier, { label: string; color: string }> = {
  free: { label: TIER_DISPLAY_NAME.free, color: "text-muted-foreground" },
  pro: { label: TIER_DISPLAY_NAME.pro, color: "text-primary" },
  elite: { label: TIER_DISPLAY_NAME.elite, color: "text-bull" },
};

function AccountPage() {
  const { user, tier, profile, loading, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const [displayName, setDisplayName] = useState("");
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [telegram, setTelegram] = useState("");
  const [chatId, setChatId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notifFlash, setNotifFlash] = useState<string | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);
  const saveNotifications = async () => {
    setSavingNotif(true);
    try {
      const r = await updateNotificationSettings({
        data: { telegram_chat_id: chatId.trim() || null, webhook_url: webhookUrl.trim() || null },
      });
      setNotifFlash(r.message ?? "Saved");
      await refresh();
    } catch (e) {
      setNotifFlash(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingNotif(false);
      setTimeout(() => setNotifFlash(null), 4000);
    }
  };
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setRisk(profile.risk_sensitivity);
      setTelegram(profile.telegram_handle ?? "");
      setChatId(profile.telegram_chat_id ?? "");
      setWebhookUrl(profile.webhook_url ?? "");
    }
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, risk_sensitivity: risk, telegram_handle: telegram || null })
      .eq("id", user.id);
    setSaving(false);
    if (!error) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      await refresh();
    }
  };

  // Watchlist
  const { data: watchlist } = useQuery({
    queryKey: ["watchlist", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: lists } = await supabase.from("watchlists").select("*").eq("user_id", user!.id).order("created_at");
      const defaultList = lists?.find((l) => l.is_default) ?? lists?.[0];
      if (!defaultList) return { list: null, items: [] };
      const { data: items } = await supabase
        .from("watchlist_items")
        .select("*")
        .eq("watchlist_id", defaultList.id)
        .order("added_at");
      return { list: defaultList, items: items ?? [] };
    },
  });

  const [newSym, setNewSym] = useState("");
  const addCoin = async () => {
    const sym = newSym.trim().toUpperCase();
    if (!sym || !watchlist?.list || !user) return;
    await supabase.from("watchlist_items").insert({
      watchlist_id: watchlist.list.id,
      user_id: user.id,
      symbol: sym,
    });
    setNewSym("");
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  };
  const removeCoin = async (id: string) => {
    await supabase.from("watchlist_items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["watchlist"] });
  };

  // Subscription details
  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Payment history
  const { data: payments } = useQuery({
    queryKey: ["payments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const recheck = useServerFn(verifyPayment);
  const cancelFn = useServerFn(cancelSubscription);
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const handleRecheck = async (id: string) => {
    setRechecking(id);
    try {
      await recheck({ data: { id } });
      await refresh();
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
    } finally {
      setRechecking(null);
    }
  };

  const handleCancelToggle = async (cancel: boolean) => {
    setCancelBusy(true);
    setCancelMsg(null);
    try {
      const r = await cancelFn({ data: { cancel } });
      setCancelMsg(r.message);
      qc.invalidateQueries({ queryKey: ["subscription"] });
    } finally {
      setCancelBusy(false);
    }
  };

  // Auto-poll pending payments every 15s (max 8 attempts ≈ 2 minutes)
  const pollRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!payments) return;
    const pending = payments.filter((p) => p.status === "pending");
    if (pending.length === 0) return;
    const interval = setInterval(() => {
      for (const p of pending) {
        const tries = pollRef.current.get(p.id) ?? 0;
        if (tries >= 8) continue;
        pollRef.current.set(p.id, tries + 1);
        recheck({ data: { id: p.id } })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["payments"] });
            qc.invalidateQueries({ queryKey: ["subscription"] });
          })
          .catch(() => undefined);
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [payments, recheck, qc]);

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  const tierInfo = TIER_META[tier];

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-bear">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        <h1 className="text-3xl font-bold mb-1">Account</h1>
        <p className="text-sm text-muted-foreground mb-8">{user.email}</p>

        <div className="mb-6">
          <CoachSettings />
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Subscription */}
          <div className="glass-card p-6 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-primary" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Plan</span>
            </div>
            <div className={`text-3xl font-extrabold ${tierInfo.color}`}>{tierInfo.label}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {subscription?.status === "trialing" && "Free trial — full Elite access"}
              {subscription?.status !== "trialing" && tier === "free" && "Limited modules · delayed updates"}
              {subscription?.status !== "trialing" && tier === "pro" && "Real-time AI · all core modules"}
              {subscription?.status !== "trialing" && tier === "elite" && "Full on-chain · whale clustering · deep cognition"}
            </p>
            {subscription?.current_period_end && tier !== "free" && (
              <p className="text-xs text-muted-foreground mt-2">
                {subscription.status === "trialing" ? "Trial ends" : subscription.cancel_at_period_end ? "Expires" : "Renews"}:{" "}
                <span className="text-foreground">
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              </p>
            )}
            {subscription?.cancel_at_period_end && subscription.status !== "trialing" && (
              <p className="text-[11px] text-amber-400 mt-1">
                Auto-renewal off. Plan ends at period end.
              </p>
            )}
            <Link
              to="/pricing"
              className="mt-4 inline-flex items-center justify-center w-full h-10 rounded-lg bg-gradient-primary text-white text-sm font-semibold"
            >
              {subscription?.status === "trialing" ? "Choose a plan" : tier === "free" ? "Upgrade" : "Extend / Upgrade"}
            </Link>
            {tier !== "free" && subscription?.status !== "trialing" && (
              <button
                onClick={() => handleCancelToggle(!subscription?.cancel_at_period_end)}
                disabled={cancelBusy}
                className="mt-2 inline-flex items-center justify-center gap-1 w-full h-9 rounded-lg border border-border bg-surface hover:bg-surface-2 text-xs text-muted-foreground disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                {subscription?.cancel_at_period_end ? "Re-enable auto-renewal" : "Cancel auto-renewal"}
              </button>
            )}
            {cancelMsg && (
              <p className="text-[10px] text-muted-foreground mt-2">{cancelMsg}</p>
            )}
          </div>

          {/* Profile */}
          <div className="glass-card p-6 lg:col-span-2">
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">Profile</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Display name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Risk sensitivity</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["low", "medium", "high"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRisk(r)}
                      className={`h-10 rounded-lg text-sm font-medium capitalize transition ${
                        risk === r ? "bg-gradient-primary text-white" : "bg-surface border border-border text-foreground/80 hover:bg-surface-2"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Telegram handle (for Elite alerts)</label>
                <input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@yourhandle"
                  className="mt-1 w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm"
                />
              </div>
              <TelegramLinkCard
                linked={Boolean(profile?.telegram_user_id)}
                handle={profile?.telegram_handle ?? null}
                onChanged={refresh}
              />
              <div className="pt-2 border-t border-border/50 space-y-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Alert delivery</p>
                <div>
                  <label className="text-xs text-muted-foreground">Telegram chat ID (Elite)</label>
                  <input
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="123456789"
                    className="mt-1 w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Webhook URL (Elite)</label>
                  <input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-endpoint.example.com/hook"
                    className="mt-1 w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm"
                  />
                </div>
                <button
                  onClick={saveNotifications}
                  disabled={savingNotif}
                  className="h-9 px-4 rounded-lg glass-panel text-xs font-semibold disabled:opacity-50"
                >
                  {savingNotif ? "Saving…" : "Save delivery settings"}
                </button>
                {notifFlash && <p className="text-xs text-muted-foreground">{notifFlash}</p>}
              </div>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="h-10 px-5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : savedFlash ? "Saved ✓" : "Save changes"}
              </button>
            </div>
          </div>
        </div>

        {/* Watchlist */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Watchlist
            </h2>
            <span className="text-xs text-muted-foreground">{watchlist?.items.length ?? 0} coins</span>
          </div>
          <div className="flex gap-2 mb-4">
            <input
              value={newSym}
              onChange={(e) => setNewSym(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCoin()}
              placeholder="Symbol (e.g. SOL)"
              className="flex-1 h-10 px-3 rounded-lg bg-surface border border-border text-sm uppercase"
            />
            <button onClick={addCoin} className="h-10 px-4 rounded-lg bg-gradient-primary text-white text-sm font-semibold flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {watchlist?.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border">
                <div>
                  <div className="font-bold text-sm">{it.symbol}</div>
                  {it.coin_name && <div className="text-[11px] text-muted-foreground">{it.coin_name}</div>}
                </div>
                <button onClick={() => removeCoin(it.id)} className="text-muted-foreground hover:text-bear">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {!watchlist?.items.length && (
              <div className="col-span-full text-sm text-muted-foreground py-6 text-center">
                Add your first coin to start tracking AI insights.
              </div>
            )}
          </div>
        </div>

        {/* Payment history */}
        <div className="glass-card p-6 mt-6">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" /> Payment History
          </h2>
          {!payments?.length ? (
            <p className="text-sm text-muted-foreground py-4">
              No payments yet. Upgrade your plan to see payment records here.
            </p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const statusColor =
                  p.status === "verified"
                    ? "text-bull bg-bull/10"
                    : p.status === "pending"
                    ? "text-amber-400 bg-amber-400/10"
                    : "text-bear bg-bear/10";
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-surface border border-border gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold uppercase">{p.tier}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{p.cycle}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono">${Number(p.expected_amount).toFixed(2)}</span>
                      </div>
                      {p.provider_ref && (
                        <div className="text-[10px] text-muted-foreground font-mono break-all">{p.provider_ref}</div>
                      )}
                      {p.notes && <div className="text-[10px] text-muted-foreground mt-1">{p.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${statusColor}`}>
                        {p.status}
                      </span>
                      {p.status === "pending" && (
                        <button
                          onClick={() => handleRecheck(p.id)}
                          disabled={rechecking === p.id}
                          className="p-1.5 hover:bg-surface-2 rounded text-muted-foreground"
                          title="Re-check with Paystack"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${rechecking === p.id ? "animate-spin" : ""}`} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
