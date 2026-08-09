import { Activity, Anchor, Brain, Cpu, Flame, Gauge, Layers, Lock, Radar, Radio, ShieldAlert, Sparkles, TrendingDown, Trophy, Users, Wallet, Zap } from "lucide-react";
import { canAccess, useAuth } from "@/lib/auth";
import { Link } from "@tanstack/react-router";
import { BrandLockup } from "./BrandLogo";
import coachMark from "@/assets/coach-mark.png";

export const NAV_ITEMS = [
  { icon: Trophy, label: "Recommendations", key: "recommendations" },
  { icon: TrendingDown, label: "Exit Intelligence", key: "exit" },
  { icon: Cpu, label: "Brain AI v3", key: "brain-v3" },
  { icon: Sparkles, label: "Narrative Detect", key: "narrative-detect" },
  { icon: Zap, label: "Momentum Ignition", key: "momentum" },
  { icon: Users, label: "Smart Money", key: "smart-money" },
  { icon: Brain, label: "Elite Brain", key: "elite-brain" },
  { icon: Anchor, label: "Whale Activity", key: "whale" },
  { icon: Brain, label: "Sentiment", key: "sentiment" },
  { icon: Radio, label: "Event Signals", key: "events" },
  { icon: Activity, label: "Market Flow", key: "market-flow" },
  { icon: Radar, label: "On-Chain Intel", key: "onchain" },
  { icon: Layers, label: "Altcoin Heatmap", key: "heatmap" },
  { icon: Flame, label: "Meme Radar", key: "meme" },
  { icon: ShieldAlert, label: "Risk Index", key: "risk" },
  { icon: Wallet, label: "Coin Intel", key: "coin-intel" },
] as const;

export type ModuleKey = (typeof NAV_ITEMS)[number]["key"];

export function ModuleNavList({
  active,
  onSelect,
}: {
  active?: ModuleKey;
  onSelect: (key: ModuleKey) => void;
}) {
  const { tier } = useAuth();
  return (
    <>
      <p className="px-3 pt-3 pb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
        Modules
      </p>
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.key;
        const locked = !canAccess(tier, item.key);
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              isActive
                ? "bg-gradient-primary text-white shadow-[0_0_30px_-5px_var(--neon-blue)] ring-1 ring-white/30"
                : "text-foreground/90 hover:text-white hover:bg-surface/70"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                isActive ? "bg-white/15" : "bg-surface-2/60 group-hover:bg-surface-2"
              }`}
            >
              <item.icon
                className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-white" : "text-primary"}`}
                strokeWidth={2.25}
              />
            </div>
            <span className="flex-1 min-w-0 text-left truncate">{item.label}</span>
            {locked && <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />}
          </button>
        );
      })}
    </>
  );
}

export function AppShortcutLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Link
        to="/coach"
        onClick={onNavigate}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-foreground/90 hover:text-white hover:bg-surface/70 transition-all"
      >
        <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-surface-2/60">
          <img src={coachMark} alt="" width={512} height={512} loading="lazy" className="w-[18px] h-[18px]" />
        </div>
        <span className="flex-1 min-w-0 text-left truncate">Flux the AI Coach</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-primary shrink-0">New</span>
      </Link>
      <Link
        to="/portfolio"
        onClick={onNavigate}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-foreground/90 hover:text-white hover:bg-surface/70 transition-all"
      >
        <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-surface-2/60">
          <Wallet className="w-[18px] h-[18px] text-primary" strokeWidth={2.25} />
        </div>
        <span className="flex-1 min-w-0 text-left truncate">My Portfolio</span>
      </Link>
      <Link
        to="/autopilot"
        onClick={onNavigate}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-foreground/90 hover:text-white hover:bg-surface/70 transition-all"
      >
        <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-surface-2/60">
          <Gauge className="w-[18px] h-[18px] text-primary" strokeWidth={2.25} />
        </div>
        <span className="flex-1 min-w-0 text-left truncate">Autopilot</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-primary shrink-0">New</span>
      </Link>
    </>
  );
}

export function Sidebar({ active, onChange }: { active: ModuleKey; onChange: (key: ModuleKey) => void }) {
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-border/50 bg-background/60 backdrop-blur-xl">
      <div className="flex items-center px-5 h-[4.5rem] border-b border-border/50">
        <BrandLockup size="xl" tagline="Market Intelligence" priority />
      </div>

      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        <ModuleNavList active={active} onSelect={onChange} />
      </nav>

      <div className="px-3 pb-1 space-y-1">
        <AppShortcutLinks />
      </div>

      <div className="p-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-bull animate-pulse-glow text-bull" />
            <span className="text-xs font-medium">Live data stream</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Real-time liquidity routing across 1,240+ assets and 86 venues.
          </p>
        </div>
      </div>
    </aside>
  );
}
