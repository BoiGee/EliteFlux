import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/eliteflux/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — EliteFlux" },
      { name: "description", content: "How EliteFlux collects, uses, stores and deletes your data — in plain language." },
      { property: "og:title", content: "Privacy Policy — EliteFlux" },
      { property: "og:description", content: "How EliteFlux collects, uses, stores and deletes your data — in plain language." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://elitefluxx.lovable.app/privacy" },
      { property: "og:image", content: "https://elitefluxx.lovable.app/og-banner.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://elitefluxx.lovable.app/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://elitefluxx.lovable.app/privacy" }],
  }),

  component: () => (
    <LegalPage title="Privacy Policy" updated="May 29, 2026">
      <h2>1. Data we collect</h2>
      <p>Account email, display name, optional Telegram handle, risk preferences, watchlist symbols, payment references from our card processor Paystack, and standard request logs (IP, user-agent).</p>

      <h2>2. How we use it</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>To run the Service (authentication, subscriptions, alerts).</li>
        <li>To process and verify card payments and subscription renewals through Paystack.</li>
        <li>To send transactional emails (login, password reset, billing).</li>
        <li>To improve product reliability and detect abuse.</li>
      </ul>

      <h2>3. What we don't do</h2>
      <p>We do not sell your data. We do not run third-party ad trackers on the dashboard.</p>

      <h2>4. Storage</h2>
      <p>Data is stored on Lovable Cloud infrastructure (Supabase / managed Postgres) with row-level security.</p>

      <h2>5. Your rights</h2>
      <p>You can export, correct, or delete your account at any time by contacting support@eliteflux.app. Deletion removes profile, watchlist, alerts, and payment history within 30 days.</p>

      <h2>6. Cookies</h2>
      <p>We use only essential cookies for authentication. No advertising cookies.</p>

      <h2>7. Contact</h2>
      <p>privacy@eliteflux.app</p>
    </LegalPage>
  ),
});
