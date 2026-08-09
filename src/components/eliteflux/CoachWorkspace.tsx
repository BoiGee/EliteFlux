import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus, Trash2, TrendingUp, TrendingDown, Eye, Ban } from "lucide-react";
import { CoachChat } from "./CoachChat";
import {
  createCoachThread,
  deleteCoachThread,
  listCoachCalls,
  listCoachThreads,
  getCoachProfile,
} from "@/lib/coach.functions";
import { STANCE_LABEL, LEVEL_LABEL, type CallStance } from "@/lib/coach-shared";
import { DailyBriefing } from "./DailyBriefing";
import { TradingConditionsBanner } from "./TradingConditionsBanner";

const STANCE_ICON: Record<CallStance, typeof TrendingUp> = {
  accumulate: TrendingUp,
  reduce: TrendingDown,
  watch: Eye,
  avoid: Ban,
};

export function CoachWorkspace({ threadId }: { threadId: string }) {
  const qc = useQueryClient();
  const [pane, setPane] = useState<"chat" | "threads" | "journal">("chat");
  const navigate = useNavigate();
  const loadThreads = useServerFn(listCoachThreads);
  const newThread = useServerFn(createCoachThread);
  const delThread = useServerFn(deleteCoachThread);
  const loadCalls = useServerFn(listCoachCalls);
  const loadProfile = useServerFn(getCoachProfile);

  const threads = useQuery({ queryKey: ["coach-threads"], queryFn: () => loadThreads({}) });
  const journal = useQuery({ queryKey: ["coach-calls"], queryFn: () => loadCalls({}), refetchInterval: 120_000 });
  const profile = useQuery({ queryKey: ["coach-profile"], queryFn: () => loadProfile({}) });

  const createM = useMutation({
    mutationFn: () => newThread({}),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ["coach-threads"] });
      navigate({ to: "/coach/$threadId", params: { threadId: t.id } });
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => delThread({ data: { threadId: id } }),
    onSuccess: async (_r, id) => {
      await qc.invalidateQueries({ queryKey: ["coach-threads"] });
      if (id === threadId) navigate({ to: "/coach" });
    },
  });

  const behavior = journal.data?.behavior;
  const calls = journal.data?.calls ?? [];
  const loadFailed = threads.isError || journal.isError || profile.isError;

  return (
    <div className="space-y-3">
      {loadFailed && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bear/40 bg-bear/10 px-4 py-2.5 text-xs">
          <span className="text-bear font-semibold">
            Some Flux data couldn't load. What you see may be incomplete.
          </span>
          <button
            onClick={() => {
              void threads.refetch();
              void journal.refetch();
              void profile.refetch();
            }}
            className="h-8 px-3 rounded-lg bg-bear/20 text-bear font-bold hover:bg-bear/30"
          >
            Retry
          </button>
        </div>
      )}
      {/* Mobile pane switcher */}
      <div className="xl:hidden grid grid-cols-3 gap-1 p-1 rounded-xl glass-panel">
        {(
          [
            ["chat", "Flux"],
            ["threads", "Chats"],
            ["journal", "Journal"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPane(key)}
            className={`h-9 rounded-lg text-xs font-bold transition ${
              pane === key ? "bg-gradient-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)_300px] gap-5">
        {/* Threads */}
        <aside className={`space-y-2 ${pane === "threads" ? "block" : "hidden"} xl:block`}>
        <button
          onClick={() => createM.mutate()}

          disabled={createM.isPending}
          className="w-full h-10 rounded-lg bg-gradient-cyber text-background font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <MessageSquarePlus className="w-4 h-4" /> New conversation
        </button>
        <div className="glass-panel rounded-xl p-2 space-y-1 max-h-[320px] xl:max-h-[65vh] overflow-y-auto">
          {(threads.data ?? []).length === 0 && (
            <p className="text-[11px] text-muted-foreground p-3">No conversations yet.</p>
          )}
          {(threads.data ?? []).map((t) => (
            <div
              key={t.id}
              className={`group flex items-center gap-1 rounded-lg px-1 ${
                t.id === threadId ? "bg-primary/10 border border-primary/40" : "hover:bg-surface/60"
              }`}
            >
              <Link
                to="/coach/$threadId"
                params={{ threadId: t.id }}
                onClick={() => setPane("chat")}
                className="flex-1 min-w-0 px-2 py-2 text-left"
              >
                <p className="text-xs font-semibold truncate">{t.title}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</p>
              </Link>
              <button
                onClick={() => deleteM.mutate(t.id)}
                title="Delete conversation"
                className="opacity-100 xl:opacity-0 xl:group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-bear transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <section className={`flex-col gap-3 min-w-0 ${pane === "chat" ? "flex" : "hidden"} xl:flex`}>
        <TradingConditionsBanner />
        <div className="glass-panel rounded-2xl p-4 flex flex-col h-[70vh] min-h-[520px]">
          <CoachChat key={threadId} threadId={threadId} className="flex-1 min-h-0" />
          {profile.data && (
            <p className="mt-2 text-[10px] text-muted-foreground text-center">
              {profile.data.usedToday}/{profile.data.dailyLimit} Flux messages today ·{" "}
              {profile.data.tier.toUpperCase()} plan
              {profile.data.experience_level ? ` · ${LEVEL_LABEL[profile.data.experience_level]}` : ""}
            </p>
          )}
        </div>
      </section>

      {/* Journal + behaviour */}
      <aside className={`space-y-4 ${pane === "journal" ? "block" : "hidden"} xl:block`}>
        <DailyBriefing />

        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-bold">Your operating profile</p>
          {!behavior || behavior.graded === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Log calls with Flux and EliteFlux will grade them against what the market actually did — then show
              the habits that help or hurt you.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Graded" value={String(behavior.graded)} />
                <Stat label="Right side" value={behavior.hitRate !== null ? `${behavior.hitRate}%` : "—"} />
                <Stat label="Discipline" value={behavior.discipline !== null ? `${behavior.discipline}` : "—"} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {behavior.patterns.map((p) => (
                  <li
                    key={p.key}
                    className={`px-2.5 py-2 rounded-lg border text-[11px] ${
                      p.severity === "warn"
                        ? "border-warn/40 bg-warn/10"
                        : p.severity === "good"
                          ? "border-bull/40 bg-bull/10"
                          : "border-border/50 bg-surface/40"
                    }`}
                  >
                    <p className="font-semibold">{p.label}</p>
                    <p className="text-muted-foreground mt-0.5">{p.detail}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="glass-panel rounded-xl p-4">
          <p className="text-xs font-bold">Call journal</p>
          {calls.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Nothing logged yet. Tell Flux your view and ask it to log the call.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 max-h-[320px] overflow-y-auto">
              {calls.slice(0, 20).map((c) => {
                const Icon = STANCE_ICON[c.stance];
                return (
                  <li key={c.id} className="px-2.5 py-2 rounded-lg bg-surface/40 border border-border/40">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold">{c.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">{STANCE_LABEL[c.stance]}</span>
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">{c.source}</span>
                      {c.grade && (
                        <span
                          className={`text-[10px] font-black px-1.5 rounded ${
                            ["A", "B"].includes(c.grade)
                              ? "bg-bull/20 text-bull"
                              : c.grade === "C"
                                ? "bg-surface text-muted-foreground"
                                : "bg-bear/20 text-bear"
                          }`}
                        >
                          {c.grade}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {c.verdict ?? c.rationale ?? "Open — grading when the horizon elapses."}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </aside>
      </div>
    </div>
  );

}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface/50 border border-border/40 py-2">
      <p className="text-sm font-extrabold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
