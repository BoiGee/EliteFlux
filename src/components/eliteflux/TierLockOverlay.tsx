import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import type { Tier } from "@/lib/auth";
import { TIER_DISPLAY_NAME } from "@/lib/tier-matrix";

export function TierLockOverlay({ required }: { required: Tier }) {
  const label = TIER_DISPLAY_NAME[required];
  return (
    <div className="relative min-h-[60vh] grid place-items-center">
      <div className="glass-card p-10 max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-primary grid place-items-center mx-auto mb-4 glow-primary">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <div className="text-[11px] uppercase tracking-widest text-primary font-bold mb-2 flex items-center gap-1 justify-center">
          <Sparkles className="w-3 h-3" /> {label} feature
        </div>
        <h2 className="text-2xl font-bold mb-2">Unlock with {label}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This intelligence module is part of the {label} tier. Upgrade to access real-time AI signals, advanced
          on-chain analytics, and priority data streams.
        </p>
        <Link
          to="/pricing"
          className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-gradient-primary text-white font-semibold text-sm"
        >
          View plans
        </Link>
      </div>
    </div>
  );
}
