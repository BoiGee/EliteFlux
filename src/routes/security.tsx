import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/eliteflux/TopBar";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";
import { KeySafety } from "@/components/eliteflux/KeySafety";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security & Key Safety — EliteFlux" },
      {
        name: "description",
        content:
          "Exactly what happens to an exchange API key you connect to EliteFlux: encryption, read-only defaults, no withdrawal permission, and instant deletion.",
      },
      { property: "og:title", content: "EliteFlux Security & Key Safety" },
      {
        property: "og:description",
        content: "Plain-language answers on how EliteFlux handles exchange keys and wallet addresses.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elite-flux.com/security" },
      { property: "og:image", content: "https://elite-flux.com/og-banner.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elite-flux.com/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elite-flux.com/security" }],

  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="p-4 sm:p-5 lg:p-7 space-y-6 max-w-5xl mx-auto">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Security & <span className="text-gradient">key safety</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Read this before you connect anything. It explains, without jargon, what EliteFlux can and cannot do with
            what you give it.
          </p>
        </div>

        <KeySafety />

        <section className="glass-panel rounded-xl p-5 space-y-3">
          <h2 className="font-semibold">What EliteFlux can never do</h2>
          <ul className="space-y-1.5">
            {[
              "Withdraw, transfer or move funds off your exchange — no key with that permission is accepted.",
              "Touch your on-chain wallets. Public addresses are read; nothing is ever signed.",
              "Trade at all unless you explicitly grant trading permission and arm Autopilot yourself.",
              "Exceed the limits you set — every guardrail is re-checked on our server at the moment of execution.",
              "Use leverage, margin or futures.",
            ].map((t) => (
              <li key={t} className="text-xs text-muted-foreground leading-relaxed">
                · {t}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You can disconnect everything in one tap from your{" "}
            <Link to="/portfolio" className="text-primary hover:underline">
              portfolio page
            </Link>
            , and the kill switch on{" "}
            <Link to="/autopilot" className="text-primary hover:underline">
              Autopilot
            </Link>{" "}
            stops all automated activity instantly.
          </p>
        </section>

        <SiteFooter contained={false} />
      </main>
    </div>
  );
}
