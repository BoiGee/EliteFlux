# Hide Data Sources + Polish Header & Footer

Two changes, both presentation-only: remove copy that reveals where the data comes from or how the signals are computed, and rebuild the site header and footer so they look finished instead of raw.

## 1. Remove source and methodology clues

Replace vendor names and internal-method wording with outcome-focused language ("Live market feed", "EliteFlux engine"). No logic changes — the feeds keep working exactly as they do today.

Copy to change:

- Dashboard subtitle and footer note (`src/routes/index.tsx`) — drop "streaming from Binance & CoinGecko" and "Data: Binance + CoinGecko".
- Top bar live pill (`TopBar.tsx`) — "Live · Binance" becomes "Live market feed".
- Landing hero badge and feature copy (`Landing.tsx`) — drop "Live from Binance & CoinGecko" and "read from live volume microstructure" / "raw market microstructure".
- Sentiment module note (`SentimentEngine.tsx`) — remove "Derived from behavioral signals — extensible to social APIs (X/Reddit)".
- Elite Brain footer strip (`EliteBrainSystem.tsx`) — remove "5 layers · weighted composite".
- Pricing (`pricing.tsx`) — "Priority WebSocket streams" becomes "Priority real-time streams"; drop the "verified on-chain via TronGrid" mention (keep "verified on-chain").
- Payment dialog (`UsdtPaymentDialog.tsx`) — same TronGrid removal.
- Terms (`terms.tsx`) — keep the legal meaning, but say "derived from market data" instead of naming methods/providers.

## 2. Header and footer redesign

Header (both the app `TopBar` and the marketing header in `Landing`):
- Add the EliteFlux logotype mark to the app top bar (currently it only shows a search box), with consistent height, spacing and a subtle gradient underline.
- Tidy the right-side cluster: uniform 36px controls, clearer separation between live status, notifications, settings, admin and the account/tier chip.
- Marketing header gets the same visual language: logo mark, nav links (Features, Pricing, Sign in), and a solid primary CTA.

Footer (shared component used by both dashboard and landing):
- Build one `SiteFooter` component: brand block with short one-line positioning statement, a link column layout (Product / Legal), the non-advice disclaimer, and a copyright line.
- Soft top border, generous padding, muted-token styling, responsive stack on mobile.
- Replace the two ad-hoc footers in `index.tsx` and `Landing.tsx` with it.

## Technical notes

- All edits are in `src/components/eliteflux/*` and `src/routes/*`; no engine, API, or database changes.
- New file: `src/components/eliteflux/SiteFooter.tsx`.
- Styling uses existing semantic tokens (`glass-panel`, `text-gradient`, `muted-foreground`) — no hardcoded colors.
