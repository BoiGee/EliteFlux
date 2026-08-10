import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sidebar, type ModuleKey, NAV_ITEMS } from "@/components/eliteflux/Sidebar";
import { TopBar } from "@/components/eliteflux/TopBar";
import { MarketOverview } from "@/components/eliteflux/MarketOverview";
import { AltcoinHeatmap } from "@/components/eliteflux/AltcoinHeatmap";
import { MemeRadar } from "@/components/eliteflux/MemeRadar";
import { NarrativeEngine } from "@/components/eliteflux/NarrativeEngine";
import { RiskIndex } from "@/components/eliteflux/RiskIndex";
import { CoinIntelGrid } from "@/components/eliteflux/CoinIntelGrid";
import { EliteBrainSystem } from "@/components/eliteflux/EliteBrainSystem";
import { LiveMarketProvider, useLiveMarket } from "@/lib/market";
import { WhaleActivity } from "@/components/eliteflux/WhaleActivity";
import { SentimentEngine } from "@/components/eliteflux/SentimentEngine";
import { EventSignals } from "@/components/eliteflux/EventSignals";
import { NarrativeDetection } from "@/components/eliteflux/NarrativeDetection";
import { MomentumIgnition } from "@/components/eliteflux/MomentumIgnition";
import { SmartMoneyCluster } from "@/components/eliteflux/SmartMoneyCluster";
import { PumpPressureAndV3 } from "@/components/eliteflux/PumpPressureAndV3";
import { OnChainIntel } from "@/components/eliteflux/OnChainIntel";
import { EliteRecommendations } from "@/components/eliteflux/EliteRecommendations";
import { ExitIntelligence } from "@/components/eliteflux/ExitIntelligence";
import { TierLockOverlay } from "@/components/eliteflux/TierLockOverlay";
import { TradingConditionsBanner } from "@/components/eliteflux/TradingConditionsBanner";
import { canAccess, requiredTierFor, useAuth } from "@/lib/auth";
import { Landing } from "@/components/eliteflux/Landing";
import { OnboardingDialog } from "@/components/eliteflux/OnboardingDialog";
import { WelcomeToFluxBanner } from "@/components/eliteflux/WelcomeToFluxBanner";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";

const MODULE_KEYS = NAV_ITEMS.map((n) => n.key) as readonly string[];

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { m?: ModuleKey } => {
    const m = typeof search.m === "string" && MODULE_KEYS.includes(search.m) ? (search.m as ModuleKey) : undefined;
    return m ? { m } : {};
  },
  head: () => ({
    meta: [
      { title: "EliteFlux — Crypto Market Intelligence" },
      { name: "description", content: "Premium decision intelligence for crypto: liquidity flow, BTC dominance, altcoin momentum, narratives, and risk." },
      { property: "og:title", content: "EliteFlux — Crypto Market Intelligence" },
      { property: "og:description", content: "Premium decision intelligence for crypto: liquidity flow, BTC dominance, altcoin momentum, narratives, and risk." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elite-flux.com/" },
      { property: "og:image", content: "https://elite-flux.com/og-banner.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elite-flux.com/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elite-flux.com/" }],
  }),

  component: Dashboard,
});


function Dashboard() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
      </div>
    );
  }
  if (!user) return <Landing />;
  return (
    <LiveMarketProvider>
      <DashboardInner />
    </LiveMarketProvider>
  );
}

function renderModule(key: ModuleKey) {
  switch (key) {
    case "recommendations":
      return <EliteRecommendations />;
    case "exit":
      return <ExitIntelligence />;
    case "brain-v3":
      return <PumpPressureAndV3 />;
    case "narrative-detect":
      return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2"><NarrativeDetection /></div>
          <SmartMoneyCluster />
        </div>
      );
    case "momentum":
      return <MomentumIgnition />;
    case "smart-money":
      return <SmartMoneyCluster />;
    case "elite-brain":
      return <EliteBrainSystem />;
    case "whale":
      return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2"><WhaleActivity /></div>
          <EventSignals />
        </div>
      );
    case "sentiment":
      return <SentimentEngine />;
    case "events":
      return <EventSignals />;
    case "market-flow":
      return <MarketOverview />;
    case "onchain":
      return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2"><OnChainIntel /></div>
          <SentimentEngine />
        </div>
      );
    case "heatmap":
      return <AltcoinHeatmap />;
    case "meme":
      return <MemeRadar />;
    case "risk":
      return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2"><NarrativeEngine /></div>
          <RiskIndex />
        </div>
      );
    case "coin-intel":
      return <CoinIntelGrid />;
    default:
      return null;
  }
}

function DashboardInner() {
  const { isLive, lastUpdate, error } = useLiveMarket();
  const { tier } = useAuth();
  const { m } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [active, setActive] = useState<ModuleKey>(m ?? "recommendations");
  useEffect(() => {
    if (m && m !== active) setActive(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);
  const selectModule = (key: ModuleKey) => {
    setActive(key);
    navigate({ search: { m: key }, replace: true });
  };
  const updatedLabel = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
  const activeLabel = NAV_ITEMS.find((n) => n.key === active)?.label ?? "";
  const allowed = canAccess(tier, active);

  return (
    <div className="min-h-screen flex">
      <Sidebar active={active} onChange={selectModule} />
      <div className="flex-1 min-w-0">
        <TopBar activeModule={active} onModuleChange={selectModule} />
        <OnboardingDialog />
        <main className="p-4 sm:p-5 lg:p-7 space-y-5">

          <WelcomeToFluxBanner />
          <TradingConditionsBanner />
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                {activeLabel} <span className="text-gradient">Intelligence</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Live capital flow across BTC, alts, narratives, and meme rotations — scored in real time.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse-glow ${
                  isLive ? "bg-bull text-bull" : "bg-warn text-warn"
                }`}
              />
              {isLive ? `Live · ${updatedLabel}` : "Connecting to live feed…"}
            </div>
          </div>

          {error && (
            <div className="glass-panel p-2.5 text-xs text-warn border border-warn/30">
              {error}
            </div>
          )}

          <div key={active} className="animate-rise">
            {allowed ? renderModule(active) : <TierLockOverlay required={requiredTierFor(active)} />}
          </div>

          <SiteFooter contained={false} />
        </main>
      </div>
    </div>
  );
}
