import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/eliteflux/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — EliteFlux" },
      { name: "description", content: "The terms that govern your use of EliteFlux, including subscriptions, risk disclosures and account rules." },
      { property: "og:title", content: "Terms of Service — EliteFlux" },
      { property: "og:description", content: "The terms that govern your use of EliteFlux, including subscriptions, risk disclosures and account rules." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elite-flux.com/terms" },
      { property: "og:image", content: "https://elite-flux.com/og-banner.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elite-flux.com/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elite-flux.com/terms" }],
  }),

  component: () => (
    <LegalPage title="Terms of Service" updated="May 29, 2026">
      <h2>1. Acceptance</h2>
      <p>By accessing EliteFlux ("the Service"), you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>

      <h2>2. Nature of the Service</h2>
      <p>EliteFlux is a crypto-market intelligence platform. It surfaces probabilistic signals, sentiment, whale activity, and risk indicators derived from market data. <strong>Nothing in EliteFlux is financial advice.</strong> All trading decisions are made at your own risk.</p>

      <h2>3. No Guarantees</h2>
      <p>Market data and on-chain analytics are provided "as is". Signals can be incorrect, delayed, or incomplete. EliteFlux does not guarantee uptime, accuracy, or profitability of any kind.</p>

      <h2>4. Accounts</h2>
      <p>You are responsible for safeguarding your credentials. You must be 18+ and not be barred from using crypto-related services under your local law.</p>

      <h2>5. Subscriptions &amp; Payment</h2>
      <p>Paid plans are billed by card through Paystack. Subscriptions auto-renew each cycle unless you cancel before the end of the current period from your account page. See our <a href="/refunds">Refund Policy</a>.</p>

      <h2>6. Acceptable Use</h2>
      <p>You may not (a) scrape, resell, or redistribute the data; (b) reverse-engineer the platform; (c) use the Service for market manipulation; (d) abuse the API, alerts, or rate limits.</p>

      <h2>7. Termination</h2>
      <p>We may suspend or terminate access for violations of these Terms, fraudulent payments, or abuse.</p>

      <h2>8. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, EliteFlux is not liable for any trading losses, missed opportunities, indirect or consequential damages. Our maximum aggregate liability is limited to the amount you paid in the prior three (3) months.</p>

      <h2>9. Changes</h2>
      <p>We may update these Terms. Continued use after changes constitutes acceptance.</p>

      <h2>10. Contact</h2>
      <p>Questions: support@eliteflux.app</p>
    </LegalPage>
  ),
});
