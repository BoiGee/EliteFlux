import { useState } from "react";
import { Search, Settings, ShieldCheck, User, Wallet, X } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { MobileNav } from "./MobileNav";
import { BrandMark } from "./BrandLogo";
import type { ModuleKey } from "./Sidebar";
import { Link } from "@tanstack/react-router";
import { useLiveMarket } from "@/lib/market";
import { useAuth } from "@/lib/auth";
import coachMark from "@/assets/coach-mark.png";

function fmt(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(n < 0.001 ? 7 : 4);
}

export function TopBar({
  activeModule,
  onModuleChange,
}: {
  activeModule?: ModuleKey;
  onModuleChange?: (key: ModuleKey) => void;
}) {
  const { snapshot, isLive } = useLiveMarket();
  const { user, tier, isAdmin, isOwner } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const base = snapshot.tickerStream.length
    ? snapshot.tickerStream
    : [{ sym: "—", price: 0, ch: 0 }];
  const items = [...base, ...base];
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-5 h-16">
        <MobileNav active={activeModule} onSelect={onModuleChange} />

        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <BrandMark size="md" priority />
          <span className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-extrabold tracking-tight text-white">
              Elite<span className="text-gradient">Flux</span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Intelligence</span>
          </span>
        </Link>
        <div className="hidden lg:block w-px h-8 bg-border/60" />

        {/* Desktop search */}
        <div className="hidden md:block flex-1 min-w-0 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search coins, narratives, wallets..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface/60 border border-border/60 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5 min-w-0">
          {/* Mobile search toggle */}
          <button
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
            className="md:hidden w-9 h-9 shrink-0 grid place-items-center rounded-lg glass-panel hover:border-primary/40 transition"
          >
            {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>
          <div className="hidden xl:flex items-center gap-2 px-3 h-9 rounded-lg glass-panel">
            <span
              className={`w-1.5 h-1.5 rounded-full animate-pulse-glow ${
                isLive ? "bg-bull text-bull" : "bg-warn text-warn"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {isLive ? "Live market feed" : "Connecting…"}
            </span>
          </div>
          <Link
            to="/coach"
            title="Flux the AI Coach"
            className="hidden lg:flex items-center gap-1.5 h-9 px-3 rounded-lg glass-panel hover:border-primary/40 transition text-xs font-semibold"
          >
            <img src={coachMark} alt="" width={512} height={512} loading="lazy" className="w-4 h-4" />
            Flux
          </Link>
          <Link
            to="/portfolio"
            title="Portfolio"
            className="hidden lg:flex items-center gap-1.5 h-9 px-3 rounded-lg glass-panel hover:border-primary/40 transition text-xs font-semibold"
          >
            <Wallet className="w-4 h-4 text-primary" />
            Portfolio
          </Link>
          <NotificationBell />
          <Link
            to="/account"
            aria-label="Settings"
            title="Settings"
            className="hidden sm:grid w-9 h-9 place-items-center rounded-lg glass-panel hover:border-primary/40 transition"
          >
            <Settings className="w-4 h-4" />
          </Link>
          {isAdmin && (
            <Link
              to={isOwner ? "/owner" : "/admin"}
              title={isOwner ? "Owner" : "Admin"}
              className="hidden sm:flex items-center gap-1 h-9 px-3 rounded-lg bg-bull/15 text-bull border border-bull/40 text-xs font-bold hover:bg-bull/25"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> {isOwner ? "Owner" : "Admin"}
            </Link>
          )}
          {user ? (
            <Link to="/account" className="ml-1 flex items-center gap-2 h-9 px-2 rounded-full bg-gradient-cyber text-background font-bold text-xs hover:opacity-90 shrink-0" title={user.email ?? ""}>
              <span className="uppercase">{tier}</span>
              <User className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <Link to="/login" className="ml-1 h-9 px-3 sm:px-4 rounded-lg bg-gradient-primary text-white text-xs font-semibold grid place-items-center shrink-0">
              Sign in
            </Link>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="md:hidden px-3 pb-3 relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Search coins, narratives, wallets..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface/60 border border-border/60 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition"
          />
        </div>
      )}

      <div className="border-t border-border/40 overflow-hidden">
        <div className="flex gap-8 py-2 whitespace-nowrap animate-marquee">
          {items.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="font-bold tracking-wide">{t.sym}</span>
              <span className="text-muted-foreground">${fmt(t.price)}</span>
              <span className={t.ch >= 0 ? "text-bull" : "text-bear"}>
                {t.ch >= 0 ? "+" : ""}
                {t.ch.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
