# Make the AI Coach the expert on EliteFlux itself

Today the Coach is an excellent *market* analyst but a poor *product* guide. It reads eight live-market tools and nothing else, so it cannot answer "how do I connect my exchange?", "what does my plan include?", "what changed this week?", or "how often is your read actually right?" — and it has no way to see the user's own account, portfolio or autopilot setup. It also has no access to the new accuracy scoreboard and confidence score, which is exactly what an honest forecast needs.

This plan gives the Coach three new kinds of memory — the product, the user's own setup, and the engine's measured track record — and tightens how it forecasts.

## 1. The Coach learns the product

A single written knowledge base of everything EliteFlux does, in plain language, with an ELI5 explanation for every feature and term:

- Every page and what it is for: dashboard modules, Recommendations, Exit Intelligence, Alerts, Portfolio, Autopilot, Coach, Account, Pricing, Security, Why EliteFlux.
- Every plan (Free / Pro / Elite): what unlocks at each level, alert channels, coach message allowance, and how USDT TRC20 payment works step by step.
- Every how-to: creating an alert, connecting an exchange or wallet read-only, the read-only safety lock, linking Telegram, setting the autonomy dial, approving or rejecting an autopilot action, the kill switch.
- Safety and privacy answers: how keys are protected, what EliteFlux never does with them, what "read-only" means.
- A glossary of every term the app shows on screen, each with a one-line babyish explanation.
- A dated **what's new** list, so the Coach can say what shipped recently (Telegram sign-in, mobile payment dialog, admin health recovery, the new self-learning accuracy loop, confidence scores).

The Coach reaches this through two new tools: one to look up any feature, term or how-to, and one to report what changed recently. Because the knowledge lives in one file, keeping the Coach current later means editing that one file — no prompt surgery.

## 2. The Coach can see the user's own setup

A new account tool gives the Coach a safe, read-only picture of the person it is talking to: their plan and what it unlocks, whether they finished onboarding, how many alerts they have and how many fired lately, whether an exchange or wallet is connected (and whether the read-only lock is on), their portfolio size and top holdings by weight, their autonomy level, whether autopilot is armed or paused, and any autopilot actions waiting on their approval.

No secrets, no API keys, no addresses beyond a masked hint. This turns vague answers into specific ones: "you have no alerts set up yet, here's the one I'd start with", or "two actions are waiting for your approval".

## 3. Honest, calibrated predictions

The Coach gets read access to the accuracy scoreboard built in the last change: how often each signal family has actually been right at 1h / 4h / 24h / 7d, its recent form, and whether it is currently drifting. It also gets the confidence score attached to every live read.

Forecast rules added to its instructions:

- Never state a future price or a certainty. Every forward-looking answer is framed as a likely direction, over a stated time window, with a confidence label and the measured track record behind it: "leaning up over the next 24h — confidence Moderate; this signal has been right about 58% of the time at that horizon."
- Always give the invalidation: the one thing that would prove the read wrong.
- If confidence is Low or the responsible signal is drifting, say so first and shrink the claim.
- When asked for a hard prediction, give the probability-shaped answer and explain, kindly, why nobody can honestly do better.

Scenario testing stays for Elite; the plain "what's likely next" framing works on every plan.

## 4. ELI5, enforced

The baby-simple explanation mode becomes a rule the Coach applies to *product* answers too, not just market ones — walking someone through connecting an exchange gets the same one-idea-per-sentence treatment, with a "What this means for you" close. New conversation starters point at the new abilities ("What can EliteFlux actually do for me?", "Walk me through connecting my exchange safely", "How accurate have your reads been lately?").

## Technical notes

- New file `src/lib/coach-knowledge.ts`: typed, client-safe knowledge base (`FEATURES`, `GLOSSARY`, `HOW_TO`, `PLANS`, `CHANGELOG`) plus a small keyword search helper. Client-safe so the Help/Glossary UI can reuse it later.
- New Coach tools in `src/lib/coach.server.ts`: `explain_feature`, `get_whats_new`, `get_my_account`, `get_engine_accuracy`. `get_market_pulse` and `get_trading_conditions` gain the `confidence` field already produced by the brain snapshot.
- `get_my_account` reads `subscriptions`, `profiles`, `alerts`, `alert_history`, `exchange_connections` (label / venue / permission / status only), `wallet_addresses` (masked), `portfolio_holdings`, `autopilot_settings`, `autopilot_actions` — never ciphertext columns.
- `get_engine_accuracy` calls the existing `loadAccuracy` and `loadModelWeights` from `src/lib/signal-tracking.server.ts` plus `detectDrift`; returns hit rate, sample count, recent form and drift flags per signal family.
- `COACH_TOOLS_BY_TIER` in `src/lib/coach-shared.ts` grows: the product, changelog, account and accuracy tools are available on every plan (they describe the product and the user's own data); market-depth tools keep their current tier gates.
- `buildCoachSystemPrompt` gains a product-expert section, the forecast/calibration rules, and a pointer to call `explain_feature` rather than improvising product answers. The existing "never reveal how the intelligence is built" rule is preserved — the knowledge base describes *what* features do, never how they are computed or which data sources feed them.
- Daily briefing (`coach-briefing.server.ts`) surfaces a "new in EliteFlux" line when the changelog has an entry the user hasn't seen.
- A test file covers knowledge-base lookup (every feature and glossary term resolves, no leaked provider names) and forecast framing helpers.
