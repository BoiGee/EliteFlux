import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { completeOnboarding } from "@/lib/alerts.functions";
import { saveCoachProfile } from "@/lib/coach.functions";
import { useAuth } from "@/lib/auth";
import { COACH_LEVELS, type CoachLevel } from "@/lib/coach-shared";
import coachMark from "@/assets/coach-mark.png";

const RISKS = [
  { key: "low" as const, label: "Conservative", body: "Fewer, higher-conviction signals. Alerts lean on exit pressure and risk-off shifts." },
  { key: "medium" as const, label: "Balanced", body: "The default: regime shifts, whale accumulation and exit pressure." },
  { key: "high" as const, label: "Aggressive", body: "Early momentum and narrative surges — more signals, more noise." },
];

export function OnboardingDialog() {
  const { user, profile, refresh } = useAuth();
  const run = useServerFn(completeOnboarding);
  const saveCoach = useServerFn(saveCoachProfile);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [level, setLevel] = useState<CoachLevel>("beginner");

  useEffect(() => {
    if (user && profile && !profile.onboarded_at) {
      setRisk(profile.risk_sensitivity ?? "medium");
      setOpen(true);
    }
  }, [user, profile]);

  const m = useMutation({
    mutationFn: async () => {
      await saveCoach({ data: { experience_level: level, goals: null } });
      return run({ data: { risk, seedAlerts: true } });
    },
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-border/60">
        <div className="flex items-center gap-2">
          <img src={coachMark} alt="" width={512} height={512} loading="lazy" className="w-6 h-6" />
          <h2 className="text-lg font-extrabold">Welcome to EliteFlux</h2>
          <span className="ml-auto text-[10px] text-muted-foreground">Step {step + 1} of 2</span>
        </div>

        {step === 0 ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick how sensitive you want your signals to be. We'll set up starter alerts to match — the bell in the top
              bar lights up whenever one fires.
            </p>
            <div className="mt-5 space-y-2">
              {RISKS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRisk(r.key)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                    risk === r.key
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/50 bg-surface/40 hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-bold">{r.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.body}</p>
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 h-11 rounded-lg bg-gradient-cyber text-background font-bold text-sm"
              >
                Continue
              </button>
              <button
                onClick={() => setOpen(false)}
                className="h-11 px-4 rounded-lg glass-panel text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              How experienced are you? Flux, your AI Coach, uses this to decide how much it explains — you can change it any
              time in your account.
            </p>
            <div className="mt-5 space-y-2">
              {COACH_LEVELS.map((l) => (
                <button
                  key={l.key}
                  onClick={() => setLevel(l.key)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                    level === l.key
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/50 bg-surface/40 hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-bold">{l.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{l.blurb}</p>
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => m.mutate()}
                disabled={m.isPending}
                className="flex-1 h-11 rounded-lg bg-gradient-cyber text-background font-bold text-sm disabled:opacity-60"
              >
                {m.isPending ? "Setting up…" : "Finish setup"}
              </button>
              <button
                onClick={() => setStep(0)}
                className="h-11 px-4 rounded-lg glass-panel text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
