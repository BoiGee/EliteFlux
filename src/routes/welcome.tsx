import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/eliteflux/Landing";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "EliteFlux — See Where Crypto Capital Moves Next" },
      {
        name: "description",
        content:
          "Real-time crypto intelligence: whale accumulation, narrative rotation, momentum ignition and exit pressure, scored live and delivered as alerts.",
      },
      { property: "og:title", content: "EliteFlux — See Where Crypto Capital Moves Next" },
      {
        property: "og:description",
        content:
          "Real-time crypto intelligence: whale accumulation, narrative rotation, momentum ignition and exit pressure, scored live and delivered as alerts.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elite-flux.com/welcome" },
      { property: "og:image", content: "https://elite-flux.com/og-banner.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elite-flux.com/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elite-flux.com/welcome" }],

  }),
  component: Landing,
});
