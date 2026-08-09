import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { X as XIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getCoachActivityStatus } from "@/lib/coach.functions";
import coachMark from "@/assets/coach-mark.png";

/**
 * Onboarding captures risk/experience settings but drops the user straight
 * onto the dashboard with nothing pointing them toward Flux — the actual
 * explainer for everything on this screen. This is that pointer, and it
 * self-clears the moment they've sent Flux one message (no dismiss flag
 * to maintain, no "seen it" column needed).
 */
export function WelcomeToFluxBanner() {
  const { user, profile } = useAuth();
  const fn = useServerFn(getCoachActivityStatus);
  const q = useQuery({
    queryKey: ["coach-activity-status"],
    queryFn: () => fn(),
    enabled: !!user && !!profile?.onboarded_at,
    staleTime: 60_000,
  });
  const [dismissed, setDismissed] = useState(false);

  if (!user || !profile?.onboarded_at || dismissed || q.isPending || q.isError || q.data?.hasMessaged) return null;

  return (
    <div className="glass-card p-3.5 flex items-center gap-3 border-l-2 border-primary animate-rise">
      <img src={coachMark} alt="" width={512} height={512} loading="lazy" className="w-8 h-8 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">New here? Ask Flux.</p>
        <p className="text-xs text-muted-foreground">
          Flux reads every signal on this dashboard for you and explains it in plain language — try "What can EliteFlux
          actually do for me?"
        </p>
      </div>
      <Link
        to="/coach"
        className="shrink-0 h-9 px-4 rounded-lg bg-gradient-cyber text-background text-xs font-bold grid place-items-center"
      >
        Ask Flux
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 p-1.5 rounded hover:bg-surface-2 text-muted-foreground/60 hover:text-muted-foreground"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
