import { createFileRoute } from "@tanstack/react-router";
import { WhyEliteFlux } from "@/components/eliteflux/WhyEliteFlux";

export const Route = createFileRoute("/why-eliteflux")({
  head: () => ({
    meta: [
      { title: "Why EliteFlux — The Advantage in Crypto Intelligence" },
      {
        name: "description",
        content:
          "Discover how EliteFlux outperforms ordinary crypto dashboards: ranked opportunities, smart-money signals, narrative detection, AI coaching, and automation on your terms.",
      },
      { property: "og:title", content: "Why EliteFlux — The Advantage in Crypto Intelligence" },
      {
        property: "og:description",
        content:
          "Discover how EliteFlux outperforms ordinary crypto dashboards: ranked opportunities, smart-money signals, narrative detection, AI coaching, and automation on your terms.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elite-flux.com/why-eliteflux" },
      { property: "og:image", content: "https://elite-flux.com/og-banner.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elite-flux.com/og-banner.jpg" },

    ],
    links: [{ rel: "canonical", href: "https://elite-flux.com/why-eliteflux" }],
  }),
  component: WhyEliteFlux,
});
