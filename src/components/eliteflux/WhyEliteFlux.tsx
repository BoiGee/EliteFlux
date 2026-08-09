import { Link } from "@tanstack/react-router";
import { SiteFooter } from "./SiteFooter";
import { BrandLockup } from "./BrandLogo";
import {
  Activity,
  ArrowRight,
  BellRing,
  Bot,
  Brain,
  CheckCircle2,
  Fish,
  LineChart,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

const ADVANTAGES = [
  {
    icon: Sparkles,
    title: "Ranked opportunities, not noise",
    body: "Elite Recommendations fuse every intelligence layer into a single 0–100 score, so you spend your time on the highest-conviction moves instead of scrolling charts.",
  },
  {
    icon: Brain,
    title: "See regime shifts before price moves",
    body: "Elite Brain v3 reads market structure and tells you whether the market is accumulating, rotating, or losing momentum — often before the candle confirms it.",
  },
  {
    icon: Fish,
    title: "Follow the smart money, not the crowd",
    body: "Whale and Smart Money clusters show you where large capital is accumulating or distributing, so you can align with informed flow instead of retail sentiment.",
  },
  {
    icon: Radar,
    title: "Catch narratives while they are still early",
    body: "Narrative Detection spots emerging themes — AI, RWA, memes, and more — as rotation begins, not after it has already been front-run.",
  },
  {
    icon: TrendingUp,
    title: "Enter before the breakout",
    body: "Momentum Ignition flags volatility compression and pre-breakout conditions, giving you a heads-up while the move is still forming.",
  },
  {
    icon: Activity,
    title: "Know when to step out",
    body: "Exit Intelligence scores fading strength so you can protect profits and avoid holding through the reversal everyone else notices too late.",
  },
  {
    icon: Wallet,
    title: "On-chain context, made readable",
    body: "On-chain signals translate wallet-flow behaviour into plain insight, without asking you to parse block explorers or raw transaction data.",
  },
];

const CHECKS = [
  "Everything updates in real time",
  "Clear 0–100 scoring on every signal",
  "Alerts via app, email, Telegram, and webhooks",
  "Flux, an AI Coach that adapts to your experience level",
  "Choose your own automation level",
  "Paper mode to practice without risk",
  "Pay by card, cancel any time",
  "Encrypted keys, read-only by default",
];

export function WhyEliteFlux() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-4">
          <Link to="/" className="group">
            <BrandLockup size="md" tagline="Market Intelligence" priority />
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link to="/" className="hidden sm:grid h-9 px-3 place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Home
            </Link>
            <Link to="/pricing" className="h-9 px-3 grid place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Pricing
            </Link>
            <Link to="/track-record" className="h-9 px-3 grid place-items-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface/60 transition">
              Track Record
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
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse-glow" /> Why traders choose EliteFlux
          </p>
          <h1 className="mt-6 text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Market intelligence that gives you <span className="text-gradient">the first move</span>
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-base text-muted-foreground">
            Most dashboards show you what already happened. EliteFlux reads live capital intent, scores every opportunity,
            and surfaces what matters while it is still actionable.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className="h-11 px-6 grid place-items-center rounded-lg bg-gradient-cyber text-background font-bold text-sm">
              Start free
            </Link>
            <Link to="/pricing" className="h-11 px-6 grid place-items-center rounded-lg glass-panel text-sm font-semibold hover:border-primary/40">
              View plans
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <div className="glass-panel rounded-2xl p-8 md:p-10 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                Price is the result. <span className="text-gradient">Capital flow is the cause.</span>
              </h2>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                EliteFlux was built for traders who are tired of reacting to charts and want to start anticipating them.
                Instead of isolated indicators, you get a single intelligence cockpit that weights market structure, whale behaviour,
                narrative momentum, and on-chain context into one clear picture.
              </p>
            </div>
            <ul className="space-y-3">
              {CHECKS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-bull shrink-0 mt-0.5" />
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <h2 className="text-xl md:text-2xl font-bold mb-2">Every layer works for you, not the other way around</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            You do not need to be a quant to use EliteFlux. Every module is scored, ranked, and explained in plain language.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ADVANTAGES.map((a) => (
              <article key={a.title} className="glass-panel rounded-xl p-5">
                <a.icon className="w-5 h-5 text-primary" />
                <h3 className="mt-3 text-sm font-bold">{a.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{a.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <div className="grid md:grid-cols-2 gap-6">
            <article className="glass-panel rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary grid place-items-center mb-4">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold">Meet Flux, your AI Coach</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Flux adapts to your level. Beginners get ELI5 explanations, step-by-step guidance, and safe-first advice.
                Advanced traders get sharper, faster reads. You can ask it to explain anything simpler, and it will tell you when conditions look green, amber, or red.
              </p>
            </article>
            <article className="glass-panel rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-cyber grid place-items-center mb-4">
                <Zap className="w-5 h-5 text-background" />
              </div>
              <h3 className="text-lg font-bold">Automation on your terms</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Choose how much the system does. Observe only, ask for advice, approve every action, or let Autopilot execute within your guardrails.
                Practice in paper mode first, set kill switches, and always stay in control.
              </p>
            </article>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <div className="glass-panel rounded-2xl p-8 grid md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <BellRing className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Alerts that reach you</h3>
                <p className="text-xs text-muted-foreground mt-1">In-app, email, Telegram and signed webhooks — evaluated continuously so you never miss an edge.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <LineChart className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Scores with memory</h3>
                <p className="text-xs text-muted-foreground mt-1">Every signal is stored, so you can compare today's reads against real market history and refine your judgement.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Your data, locked down</h3>
                <p className="text-xs text-muted-foreground mt-1">Encrypted keys, read-only access by default, no withdrawal permissions, and a kill switch you control.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-24 text-center">
          <h2 className="text-xl md:text-2xl font-bold">Ready to stop guessing?</h2>
          <p className="mt-3 max-w-xl mx-auto text-sm text-muted-foreground">
            Start with a free 7-day Elite trial. Upgrade when you want more intelligence, more alerts, and deeper automation — pay by card, cancel any time.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className="h-11 px-6 grid place-items-center rounded-lg bg-gradient-cyber text-background font-bold text-sm">
              Start free
            </Link>
            <Link to="/pricing" className="h-11 px-6 grid place-items-center rounded-lg glass-panel text-sm font-semibold hover:border-primary/40">
              View plans <ArrowRight className="inline w-4 h-4 ml-1.5" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
