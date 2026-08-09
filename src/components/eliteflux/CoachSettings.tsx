import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCoachProfile, saveCoachProfile } from "@/lib/coach.functions";
import { COACH_LEVELS, type CoachLevel } from "@/lib/coach-shared";
import coachMark from "@/assets/coach-mark.png";

export function CoachSettings() {
  const load = useServerFn(getCoachProfile);
  const save = useServerFn(saveCoachProfile);
  const qc = useQueryClient();
  const [level, setLevel] = useState<CoachLevel>("beginner");
  const [goals, setGoals] = useState("");

  const q = useQuery({ queryKey: ["coach-profile"], queryFn: () => load({}) });

  useEffect(() => {
    if (q.data) {
      setLevel(q.data.experience_level ?? "beginner");
      setGoals(q.data.goals ?? "");
    }
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => save({ data: { experience_level: level, goals: goals.trim() || null } }),
    onSuccess: () => {
      toast.success("Coaching preferences saved");
      qc.invalidateQueries({ queryKey: ["coach-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center gap-2">
        <img src={coachMark} alt="" width={512} height={512} loading="lazy" className="w-5 h-5" />
        <p className="text-sm font-bold">Flux the AI Coach</p>
        {q.data && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {q.data.usedToday}/{q.data.dailyLimit} messages today
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Experience level — controls how much Flux explains.</p>
      <div className="mt-2 grid sm:grid-cols-2 gap-2">
        {COACH_LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => setLevel(l.key)}
            className={`text-left px-3 py-2.5 rounded-lg border transition ${
              level === l.key ? "border-primary/60 bg-primary/10" : "border-border/50 bg-surface/40 hover:border-primary/30"
            }`}
          >
            <p className="text-xs font-bold">{l.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{l.blurb}</p>
          </button>
        ))}
      </div>

      <label className="block mt-4 text-xs text-muted-foreground">What are you trying to achieve?</label>
      <textarea
        value={goals}
        onChange={(e) => setGoals(e.target.value)}
        maxLength={400}
        rows={2}
        placeholder="e.g. grow a long-term core position without panic selling"
        className="mt-1 w-full rounded-lg bg-surface/60 border border-border/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
      />

      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="mt-3 h-10 px-5 rounded-lg bg-gradient-cyber text-background font-bold text-xs disabled:opacity-60"
      >
        {m.isPending ? "Saving…" : "Save coaching preferences"}
      </button>
    </div>
  );
}
