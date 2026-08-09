import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { getDailyBriefing } from "@/lib/coach.functions";
import coachMark from "@/assets/coach-mark.png";

export function DailyBriefing() {
  const load = useServerFn(getDailyBriefing);

  const q = useQuery({
    queryKey: ["coach-briefing"],
    queryFn: () => load({ data: { force: false } }),
    staleTime: 30 * 60_000,
    retry: false,
  });

  const refresh = useMutation({
    mutationFn: () => load({ data: { force: true } }),
    onSuccess: (d) => q.refetch().then(() => d),
  });

  const data = refresh.data ?? q.data;
  const busy = q.isLoading || refresh.isPending;

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center gap-2">
        <img src={coachMark} alt="" width={512} height={512} loading="lazy" className="w-5 h-5" />
        <p className="text-xs font-bold">{data?.title ?? "Session briefing"}</p>
        <button
          onClick={() => refresh.mutate()}
          disabled={busy}
          title="Rebuild briefing"
          className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      {busy && !data && <p className="mt-2 text-[11px] text-muted-foreground">Reading the market for you…</p>}
      {q.isError && !data && (
        <p className="mt-2 text-[11px] text-muted-foreground">Briefing unavailable right now. Try again shortly.</p>
      )}
      {data && (
        <div className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{data.body}</div>
      )}
    </div>
  );
}
