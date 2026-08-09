import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/eliteflux/TopBar";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";
import { CoachWorkspace } from "@/components/eliteflux/CoachWorkspace";
import { LiveMarketProvider } from "@/lib/market";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/coach/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat with Flux — EliteFlux AI Coach" },
      {
        name: "description",
        content: "Talk to Flux, your EliteFlux AI Coach, about the live market, your watchlist and your graded call history.",
      },
      { property: "og:title", content: "Chat with Flux — EliteFlux AI Coach" },
      {
        property: "og:description",
        content: "Live market coaching, a graded call journal and scenario stress tests inside EliteFlux.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoachThreadPage,
});

function CoachThreadPage() {
  const { threadId } = Route.useParams();
  const { user, loading } = useAuth();

  return (
    <LiveMarketProvider>
      <div className="min-h-screen">
        <TopBar />
        <main className="p-4 sm:p-5 lg:p-7 space-y-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              <span className="text-gradient">Flux</span> the AI Coach
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Personal market mentoring that adapts to your plan and experience — with a journal that grades how your
              calls actually aged.
            </p>
          </div>

          {loading ? (
            <div className="grid place-items-center py-20">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            </div>
          ) : user ? (
            <CoachWorkspace threadId={threadId} />
          ) : (
            <div className="glass-panel rounded-xl p-6 text-center">
              <p className="text-sm">Sign in to talk to Flux.</p>
              <Link
                to="/login"
                className="mt-3 inline-flex h-10 px-5 items-center rounded-lg bg-gradient-cyber text-background font-bold text-xs"
              >
                Sign in
              </Link>
            </div>
          )}

          <SiteFooter contained={false} />
        </main>
      </div>
    </LiveMarketProvider>
  );
}
