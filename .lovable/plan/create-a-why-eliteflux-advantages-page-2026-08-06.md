# Create a /why-eliteflux advantages page

Add a new marketing page that explains why a visitor should choose EliteFlux, derived from the existing product features, without exposing internal data sources or implementation details. Link to it from the public landing page.

## Goals

- Create a new route `/why-eliteflux` that lands new visitors on a benefit-first comparison page.
- Derive every advantage from the existing intelligence modules, coach, autopilot, alerts, and pricing model.
- Keep copy outcome-focused ("what it does for you") and never mention Binance, CoinGecko, TronGrid, WebSocket details, or how scores are computed.
- Add a subtle link in the existing `Landing` homepage so the page is discoverable.

## Content sections (draft)

1. **Hero** — headline + one-line positioning about seeing market opportunity before it becomes obvious.
2. **The problem with most dashboards** — generic dashboards show price; EliteFlux shows capital intent.
3. **Built-in intelligence layers** — map each feature to a user benefit:
   - Elite Recommendations (ranked opportunities, scored 0–100)
   - Elite Brain v3 (regime shifts before price moves)
   - Whale & Smart Money (accumulation / distribution clusters as they form)
   - Narrative Detection (catch rotations early)
   - Momentum Ignition (pre-breakout conditions)
   - Exit Intelligence (know when strength is fading)
   - On-chain signals (wallet flow signals)
4. **Personal edge** — AI Coach that adapts to your level, explains like a human, and can teach or guide.
5. **Optional automation** — Autopilot dial: choose how much you want the system to do, from advice only to full execution, with paper mode to practice safely.
6. **Real-time alerts** — in-app, email, Telegram, webhooks; reach you wherever you are.
7. **Pricing that is simple** — USDT-only plans, no fiat complexity, free tier available.
8. **Security stance** — keys are encrypted, read-only access, no withdrawal permissions, user controls the kill switch.
9. **CTA strip** — Start free / View plans.

## Design approach

- Reuse the same glassmorphism, gradient typography, and max-width 6xl container as the existing `Landing` page.
- Use a sticky marketing header with the same logo, nav, and CTA as `Landing`.
- Use the `SiteFooter` component for the footer.
- Keep the layout as stacked sections (hero, comparison, feature grid, proof points, CTA) so it reads like a marketing narrative, not a dashboard.

## Files to create / edit

- **New route:** `src/routes/why-eliteflux.tsx` — route definition, SEO `head()`, and component wrapper.
- **New component:** `src/components/eliteflux/WhyEliteFlux.tsx` — the page content and sections.
- **Edit:** `src/components/eliteflux/Landing.tsx` — add a "Why EliteFlux" or "See how we compare" link in the header and/or hero area, pointing to `/why-eliteflux`.
- **Edit:** `src/routes/__root.tsx` if header/footer changes need to be shared (not expected; changes stay local to the marketing surface).

## Technical notes

- No backend, database, or auth changes.
- The page is public and static; it does not use `useAuth` or `LiveMarketProvider`.
- Route string must match filename: `createFileRoute("/why-eliteflux")` in `src/routes/why-eliteflux.tsx`.
- `head()` metadata should include title, description, og:title, og:description, og:type, and twitter:card.
- No hardcoded colors; use existing semantic tokens (`bg-background`, `text-gradient`, `glass-panel`, `muted-foreground`).
