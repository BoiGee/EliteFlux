import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/eliteflux/TopBar";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";
import { LiveMarketProvider } from "@/lib/market";
import { useAuth } from "@/lib/auth";
import { createCoachThread, listCoachThreads } from "@/lib/coach.functions";

export const Route = createFileRoute("/coach/")({
  head: () => ({
    meta: [
      { title: "Flux the AI Coach — EliteFlux" },
      {
        name: "description",
        content:
          "Your personal EliteFlux market coach: live market reads, graded call journal, behaviour profiling and scenario stress tests.",
      },
      { property: "og:title", content: "Flux the AI Coach — EliteFlux" },
      {
        property: "og:description",
        content: "A market mentor that adapts to your plan and experience, and grades your own calls over time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoachIndex,
});

function CoachIndex() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const loadThreads = useServerFn(listCoachThreads);
  const newThread = useServerFn(createCoachThread);
  const bootstrapped = useRef(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const threads = useQuery({
    queryKey: ["coach-threads"],
    queryFn: () => loadThreads({}),
    enabled: !!user,
    retry: 1,
  });

  useEffect(() => {
    if (!user || !threads.data || bootstrapped.current) return;
    bootstrapped.current = true;
    const first = threads.data[0];
    if (first) {
      navigate({ to: "/coach/$threadId", params: { threadId: first.id }, replace: true });
    } else {
      newThread({})
        .then((t) => navigate({ to: "/coach/$threadId", params: { threadId: t.id }, replace: true }))
        .catch((e: unknown) => {
          bootstrapped.current = false;
          setBootError(e instanceof Error ? e.message : "Could not start a conversation.");
        });
    }
  }, [user, threads.data, navigate, newThread]);


  if (loading) return <Splash />;

  if (!user) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <main className="p-6 max-w-xl mx-auto text-center space-y-4 mt-16">
          <h1 className="text-2xl font-extrabold">
            Meet <span className="text-gradient">Flux</span>, your AI Coach
          </h1>
          <p className="text-sm text-muted-foreground">
            A market mentor that reads the live EliteFlux intelligence, adapts to your experience level, grades your
            calls and stress-tests your watchlist. Sign in to start.
          </p>
          <Link
            to="/login"
            className="inline-flex h-11 px-6 items-center rounded-lg bg-gradient-cyber text-background font-bold text-sm"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  const failure = bootError ?? (threads.isError ? "We couldn't load your conversations." : null);
  if (failure) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <main className="p-6 max-w-md mx-auto text-center space-y-4 mt-16">
          <h1 className="text-xl font-bold">Coach is unavailable right now</h1>
          <p className="text-sm text-muted-foreground">{failure}</p>
          <button
            onClick={() => {
              setBootError(null);
              bootstrapped.current = false;
              void threads.refetch();
            }}
            className="inline-flex h-11 px-6 items-center rounded-lg bg-gradient-cyber text-background font-bold text-sm"
          >
            Try again
          </button>
        </main>
        <SiteFooter contained />
      </div>
    );
  }

  return <Splash />;
}

function Splash() {
  return (
    <LiveMarketProvider>
      <div className="min-h-screen">
        <TopBar />
        <main className="p-6 grid place-items-center min-h-[50vh]">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        </main>
        <SiteFooter contained />
      </div>
    </LiveMarketProvider>
  );
}
