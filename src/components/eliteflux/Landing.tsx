import { Link } from "@tanstack/react-router";
import { SiteFooter } from "./SiteFooter";
import { BrandLockup } from "./BrandLogo";
import {
  Activity,
  BellRing,
  Brain,
  Fish,
  LineChart,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const MODULES = [
  { icon: Sparkles, title: "Elite Recommendations", body: "Ranked opportunities fused from every intelligence layer, scored 0–100." },
  { icon: Brain, title: "Elite Brain v3", body: "Market cognition engine detecting regime shifts before they show on price." },
  { icon: Fish, title: "Whale & Smart Money", body: "Accumulation and distribution clusters, surfaced as they form." },
  { icon: Radar, title: "Narrative Detection", body: "Emerging themes — AI, RWA, memes — caught while rotation is still early." },
  { icon: TrendingUp, title: "Momentum Ignition", body: "Volatility compression and pre-breakout conditions across the universe." },
  { icon: Activity, title: "Exit Intelligence", body: "Exit pressure scoring so you know when strength is quietly fading." },
];

const PLANS = [
  {
    name: "Operator",
    price: "$79",
    points: ["Per-asset intelligence, exit, momentum, sentiment", "Confluence, stablecoin flow, volatility regime", "Position-size guidance", "Sub-minute fast-lane alerts"],
  },
  {
    name: "Elite",
    price: "$149",
    points: ["Everything in Operator", "Whale + real on-chain wallet tracking", "Options, macro correlation, deep cognition", "Autopilot, Telegram & webhooks"],
    featured: true,
  },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-4">
          <Link to="/" className="group">
            <BrandLockup size="md" tagline="Market Intelligence" priority />
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <a href="#modules" className="hidden sm:grid h-9 px-3 place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Features
            </a>
            <Link to="/why-eliteflux" className="h-9 px-3 grid place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Why EliteFlux
            </Link>
            <Link to="/pricing" className="h-9 px-3 grid place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Pricing
            </Link>
            <Link to="/login" className="h-9 px-3 grid place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Sign in
            </Link>
            <Link to="/login" className="h-9 px-4 grid place-items-center rounded-lg bg-gradient-primary text-white text-xs font-semibold hover:opacity-90 transition">
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 text-center">
          <p className="inline-flex items-center gap-2 px-3 h-7 rounded-full glass-panel text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse-glow" /> Live market intelligence
          </p>
          <h1 className="mt-6 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
            See where crypto capital <span className="text-gradient">moves next</span>
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-base text-muted-foreground">
            EliteFlux turns market noise into decisions: whale accumulation, narrative rotation,
            momentum ignition and exit pressure — scored in real time, delivered as alerts.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className="h-11 px-6 grid place-items-center rounded-lg bg-gradient-cyber text-background font-bold text-sm">
              Start free
            </Link>
            <Link to="/pricing" className="h-11 px-6 grid place-items-center rounded-lg glass-panel text-sm font-semibold hover:border-primary/40">
              View plans
            </Link>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground/80">
            No card required · Free tier includes live recommendations and 3 alerts
          </p>
        </section>

        <section id="modules" className="max-w-6xl mx-auto px-5 pb-20">
          <h2 className="text-xl font-bold mb-6">Sixteen intelligence modules, one cockpit</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULES.map((m) => (
              <article key={m.title} className="glass-panel rounded-xl p-5">
                <m.icon className="w-5 h-5 text-primary" />
                <h3 className="mt-3 text-sm font-bold">{m.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{m.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <div className="glass-panel rounded-2xl p-8 grid md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <BellRing className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Alerts that reach you</h3>
                <p className="text-xs text-muted-foreground mt-1">In-app, email, Telegram and signed webhooks — evaluated every 15 minutes.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <LineChart className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Scores with memory</h3>
                <p className="text-xs text-muted-foreground mt-1">Every run is stored, so signals can be compared against real market history.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Your data, locked down</h3>
                <p className="text-xs text-muted-foreground mt-1">Per-user access control on every table and every intelligence endpoint.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-24">
          <h2 className="text-xl font-bold mb-1">Every account starts with a 7-day free Elite trial</h2>
          <p className="text-sm text-muted-foreground mb-6">Full access, nothing held back. See the real platform before you decide anything.</p>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
            {PLANS.map((p) => (
              <article
                key={p.name}
                className={`glass-panel rounded-xl p-6 ${p.featured ? "border-primary/50 ring-1 ring-primary/25" : ""}`}
              >
                <h3 className="text-sm font-bold uppercase tracking-wide">{p.name}</h3>
                <p className="mt-2 text-3xl font-extrabold">
                  {p.price}
                  <span className="text-xs font-medium text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-4 space-y-1.5">
                  {p.points.map((pt) => (
                    <li key={pt} className="text-xs text-muted-foreground">· {pt}</li>
                  ))}
                </ul>
                <Link
                  to="/pricing"
                  className="mt-5 h-10 grid place-items-center rounded-lg bg-gradient-primary text-white text-xs font-semibold"
                >
                  Choose {p.name}
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
