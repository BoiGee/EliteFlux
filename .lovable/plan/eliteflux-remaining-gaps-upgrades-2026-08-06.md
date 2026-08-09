# EliteFlux — Remaining Gaps & Upgrades

Verified against the current code. Ordered by impact on user success (retention, conversion, trust).

## Gap 1 — Alerts never leave the app (highest impact)
Alert creation hard-codes the delivery channel to `in_app` only (`src/lib/alerts.functions.ts`), and the cron evaluator only writes rows into `alert_history`. The `email`, `telegram`, and `webhook` channels exist in the database but nothing delivers them. A user who closes the tab misses every signal — which defeats the core promise of the product.

Fix:
- Let users pick channels when creating an alert, restricted by tier (Free: in-app; Pro: + email; Elite: + telegram + webhook).
- Add delivery in the evaluator: email via the platform email service, webhook via a signed POST, Telegram via bot token to the chat ID already stored on the profile.
- Record per-alert delivery status so failures are visible, and never retry-loop a dead webhook.

## Gap 2 — No unread signal in the UI
The bell in the top bar is a plain link with no unread count, and `alert_history.read` is never set. Users have no reason to come back.

Fix: unread badge on the bell (live count), a dropdown of the last 10 fired alerts, mark-as-read on open, and a "mark all read" action.

## Gap 3 — Signed-out visitors land on the dashboard, not a pitch
`/` renders the full dashboard for everyone; there is no marketing page explaining EliteFlux or driving signup. Conversion depends on a stranger figuring out the product from a locked module grid.

Fix: a public landing route with the value proposition, module preview, plan comparison, and clear signup CTA; send authenticated users straight to the dashboard. Keeps the dashboard route intact.

## Gap 4 — Intelligence has no memory
`brain-server.ts` synthesizes fake price/volume history from the 24h change on every request (`synthesizeHistory`). Whale, momentum, and narrative scores are therefore reconstructions, not observations, and nothing can be compared over time.

Fix: persist a rolling market snapshot per cron run (per-symbol price, volume, flux score, regime), read real history when available and fall back to synthesis while the table warms up. Unlocks score history charts and "how did this call age?" — the strongest retention feature in this category.

## Gap 5 — Onboarding and empty states
New users land on an unexplained grid with locked modules and zero alerts. There is no first-run guidance.

Fix: a short first-login walkthrough (pick risk sensitivity, seed 2–3 starter alerts matching that profile, point at the bell), plus real empty states on the alerts page.

## Gap 6 — Trust and admin hardening
- `/admin` guards only by a client-side redirect. Data is safe (RLS + `has_role`), but the page flashes and it reads as unlocked.
- Payment submissions have no rate limit, so a user can spam TXID checks against TronGrid.

Fix: server-side admin check before render, and a per-user submission throttle on payment verification.

## Suggested order
1. Alert delivery + unread bell (Gaps 1 & 2) — makes the product usable when the tab is closed.
2. Landing page (Gap 3) — turns traffic into signups.
3. Snapshot history (Gap 4) — the moat.
4. Onboarding (Gap 5) and hardening (Gap 6).

## Technical notes
- Delivery runs inside `src/routes/api/public/evaluate-alerts.ts` after each successful `alert_history` insert, using the admin client already imported there.
- Channel limits belong in `tier-matrix.ts` so UI and server share one definition, matching the existing module-gating pattern.
- New tables (`market_snapshots`, `alert_deliveries`) need explicit GRANTs plus RLS: users read their own deliveries; snapshots are service-role write, authenticated read.
- Telegram and webhook secrets go through the secure secret store, not code.
