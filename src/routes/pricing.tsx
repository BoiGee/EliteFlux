import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Clock, Crown, Gift, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { initializePayment, verifyPayment } from "@/lib/payments.functions";
import { PRICING, type Tier as PayTier, type Cycle } from "@/lib/payments.config";
import { TIER_DISPLAY_NAME } from "@/lib/tier-matrix";
import { PLANS } from "@/lib/coach-knowledge";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — EliteFlux" },
      { name: "description", content: "Every account starts with a 7-day free Elite trial. Operator $79/mo, Elite $149/mo. Real-time AI crypto intelligence." },
      { property: "og:title", content: "Pricing — EliteFlux" },
      { property: "og:description", content: "Every account starts with a 7-day free Elite trial. Operator $79/mo, Elite $149/mo. Real-time AI crypto intelligence." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elitefluxx.lovable.app/pricing" },
      { property: "og:image", content: "https://elitefluxx.lovable.app/og-banner.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elitefluxx.lovable.app/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elitefluxx.lovable.app/pricing" }],
  }),

  component: PricingPage,
});

const PLAN_BY_KEY = Object.fromEntries(PLANS.map((p) => [p.key, p]));

function PricingPage() {
  const { tier, user, refresh } = useAuth();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [upgrading, setUpgrading] = useState<PayTier | null>(null);
  const [callbackResult, setCallbackResult] = useState<{ ok: boolean; message: string } | null>(null);
  const callbackRef = useRef<HTMLDivElement>(null);
  const initPayment = useServerFn(initializePayment);
  const verify = useServerFn(verifyPayment);

  // The buttons that can set this are lower on the page than the banner
  // itself (especially the Elite card) — without this, a failure below the
  // fold looks exactly like the click did nothing at all.
  useEffect(() => {
    if (callbackResult) callbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [callbackResult]);

  // Personalizes the page for a user currently mid-trial — the marketing
  // copy below is generic ("every account starts with a trial"), but a
  // trialing user needs to see their own countdown, not just that trials exist.
  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status,current_period_end")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const isTrialing = subscription?.status === "trialing";
  const trialDaysLeft = subscription?.current_period_end
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / 86400_000))
    : null;

  // Paystack redirects back here with ?reference=... after checkout —
  // verify immediately for instant feedback. The webhook is the real source
  // of truth and may land slightly before or after this.
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) return;
    window.history.replaceState(null, "", "/pricing");
    verify({ data: { id: reference } })
      .then(async (r) => {
        setCallbackResult({ ok: r.ok, message: r.message });
        if (r.ok) await refresh();
      })
      .catch((e) => setCallbackResult({ ok: false, message: e instanceof Error ? e.message : "Could not verify payment." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plans = [
    {
      tier: "free" as const,
      name: TIER_DISPLAY_NAME.free,
      icon: Gift,
      monthly: 0,
      yearly: 0,
      isFree: true,
      features: PLAN_BY_KEY.free?.includes ?? [],
    },
    {
      tier: "pro" as const,
      name: TIER_DISPLAY_NAME.pro,
      icon: Sparkles,
      monthly: PRICING.pro.monthly,
      yearly: PRICING.pro.yearly,
      features: PLAN_BY_KEY.pro?.includes ?? [],
    },
    {
      tier: "elite" as const,
      name: TIER_DISPLAY_NAME.elite,
      icon: Crown,
      monthly: PRICING.elite.monthly,
      yearly: PRICING.elite.yearly,
      highlight: true,
      features: PLAN_BY_KEY.elite?.includes ?? [],
    },
  ];

  const handleUpgrade = async (t: PayTier) => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    setUpgrading(t);
    setCallbackResult(null);
    try {
      const r = await initPayment({ data: { tier: t, cycle } });
      if (r.ok && r.authorizationUrl) {
        window.location.href = r.authorizationUrl;
        return;
      }
      setCallbackResult({ ok: false, message: r.message ?? "Could not start checkout." });
    } catch (e) {
      setCallbackResult({ ok: false, message: e instanceof Error ? e.message : "Could not start checkout." });
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Choose your <span className="text-gradient">intelligence</span> tier
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            Every account starts with a 7-day free trial of Elite — full access, nothing held back, so you see the real
            platform before you decide anything.
          </p>
        </div>

        {isTrialing && (
          <div className="max-w-2xl mx-auto mb-6 glass-panel p-4 flex items-start gap-3 text-sm border border-primary/30">
            <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>
              You're in your free <strong>Elite</strong> trial —{" "}
              <strong>
                {trialDaysLeft === 0 ? "ends today" : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}
              </strong>
              {subscription?.current_period_end && ` (${new Date(subscription.current_period_end).toLocaleDateString()})`}.
              Pick a plan below to keep full access when it ends — otherwise your account drops to a limited Free plan automatically, nothing is charged unless you choose to pay.
            </p>
          </div>
        )}

        {callbackResult && (
          <div
            ref={callbackRef}
            className={`max-w-2xl mx-auto mb-6 text-sm p-3 rounded-md ${
              callbackResult.ok
                ? "bg-bull/10 text-bull border border-bull/30"
                : "bg-bear/10 text-bear border border-bear/30"
            }`}
          >
            {callbackResult.message}
          </div>
        )}

        {/* Cycle toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 bg-surface rounded-lg border border-border">
            {(["monthly", "yearly"] as Cycle[]).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-5 h-9 rounded-md text-sm font-medium transition ${
                  cycle === c ? "bg-gradient-primary text-white" : "text-muted-foreground"
                }`}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
                {c === "yearly" && (
                  <span className="ml-2 text-[10px] bg-bull/20 text-bull px-1.5 py-0.5 rounded">
                    2 mo free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {plans.map((p) => {
            const Icon = p.icon;
            const isCurrent = tier === p.tier;
            const price = cycle === "monthly" ? p.monthly : p.yearly;
            return (
              <div
                key={p.tier}
                className={`glass-card p-7 flex flex-col ${p.highlight ? "ring-2 ring-primary shadow-[0_0_60px_-15px_var(--neon-blue)]" : ""}`}
              >
                {p.highlight && (
                  <div className="text-[10px] uppercase tracking-widest text-primary font-bold mb-2">
                    Most popular · the full stack
                  </div>
                )}
                {p.isFree && (
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
                    What's left after your trial
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-primary grid place-items-center">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold">{p.name}</span>
                </div>
                <div className="mb-1">
                  <span className="text-4xl font-extrabold">${price.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground ml-1">
                    {p.isFree ? "" : cycle === "monthly" ? "/ mo" : "/ yr"}
                  </span>
                </div>
                {!p.isFree && cycle === "yearly" && (
                  <p className="text-xs text-muted-foreground mb-4">≈ ${Math.round(p.yearly / 12)}/mo billed yearly</p>
                )}
                {(p.isFree || cycle === "monthly") && <div className="mb-4" />}
                <ul className="space-y-2.5 mb-6 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-bull shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {p.isFree ? (
                  <button
                    disabled
                    className="h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-surface text-muted-foreground cursor-default"
                  >
                    {isCurrent ? "Current plan" : "Automatic once your trial ends"}
                  </button>
                ) : (
                  <button
                    disabled={(isCurrent && !isTrialing) || upgrading === p.tier}
                    onClick={() => handleUpgrade(p.tier as PayTier)}
                    className={`h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${
                      isCurrent && !isTrialing
                        ? "bg-surface text-muted-foreground cursor-default"
                        : p.highlight
                          ? "bg-gradient-primary text-white"
                          : "bg-surface border border-border hover:bg-surface-2"
                    }`}
                  >
                    {upgrading === p.tier && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCurrent && isTrialing
                      ? `Lock in before trial ends (${trialDaysLeft}d)`
                      : isCurrent
                        ? "Current plan"
                        : !user
                          ? "Sign in to start your trial"
                          : upgrading === p.tier
                            ? "Redirecting…"
                            : isTrialing
                              ? "Switch to this plan"
                              : "Upgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="max-w-2xl mx-auto mt-8 glass-panel p-4 flex items-start gap-3 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-bull shrink-0 mt-0.5" />
          <p>
            14-day money-back guarantee, no questions asked. If your trial ends and you don't continue, your account
            simply drops to a limited Free plan — nothing is ever billed automatically until you choose to pay.
          </p>
        </div>
      </div>
    </div>
  );
}
