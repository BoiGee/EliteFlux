import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/eliteflux/LegalPage";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — EliteFlux" },
      { name: "description", content: "When EliteFlux subscription payments can be refunded, and how to request one." },
      { property: "og:title", content: "Refund Policy — EliteFlux" },
      { property: "og:description", content: "When EliteFlux subscription payments can be refunded, and how to request one." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elite-flux.com/refunds" },
      { property: "og:image", content: "https://elite-flux.com/og-banner.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elite-flux.com/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elite-flux.com/refunds" }],
  }),

  component: () => (
    <LegalPage title="Refund Policy" updated="August 8, 2026">
      <h2>Card payments via Paystack</h2>
      <p>Subscription payments are processed by Paystack and billed automatically each cycle to your card until you cancel.</p>

      <h2>When we issue refunds</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Duplicate or mistaken charge:</strong> if our system charges you twice or in error, we will refund the excess to your card within 5 business days.</li>
        <li><strong>Service unavailable:</strong> if EliteFlux is unavailable for more than 72 consecutive hours within a billing period, you may request a pro-rated refund.</li>
        <li><strong>Mistaken upgrade within 24h:</strong> if you upgraded by accident and have not used a Pro/Elite-only module, contact us within 24 hours.</li>
      </ul>

      <h2>When we do not issue refunds</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Changes of mind after the trial / preview period.</li>
        <li>Trading losses or missed signals — EliteFlux is an intelligence tool, not financial advice.</li>
        <li>Renewal charges after auto-renewal was left enabled — cancel before the renewal date to avoid this.</li>
      </ul>

      <h2>Cancelling auto-renewal</h2>
      <p>You can disable auto-renewal at any time from your <a href="/account">account page</a> — this stops future card charges. Your access continues until the end of the current period; no refund is issued for the unused portion.</p>

      <h2>How to request</h2>
      <p>Email <a href="mailto:billing@eliteflux.app">billing@eliteflux.app</a> with your account email. We respond within 3 business days.</p>
    </LegalPage>
  ),
});
