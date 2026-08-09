# EliteFlux AI Coach — personalised market mentor

A coach that reads the same live intelligence the dashboard shows, adapts to the user's plan tier *and* stated experience level, remembers conversations, and — uniquely — grades its own calls, learns the user's behavioural risk pattern, runs stress scenarios, and speaks up on its own when something needs attention.

## 1. The Coach itself

**Where it appears**
- **Sidebar chat, everywhere.** A persistent "Coach" panel that slides in from the right on any module. It always knows which module is open and what the current readings are, so "what does this mean?" just works.
- **Daily briefing.** A generated card at the top of the dashboard each session: what changed since last visit, what it means for the user's watchlist, one thing to watch today. Tap to continue in chat.
- **Per-module explainer.** A small "Explain this" control on every module header that opens the coach pre-loaded with that module's live reading in plain language.

**How it adapts**
- **Plan tier** controls depth and volume: Free gets short briefings and a small daily message budget; Pro gets full-depth analysis, journal and grading; Elite adds scenarios, proactive alerts and higher limits.
- **Experience level** (beginner / intermediate / pro, chosen during onboarding and changeable in Account) controls tone, jargon and how much is explained versus assumed.
- The coach never sees locked-module data for a tier that can't access it, so the paywall stays honest.

**Memory:** threaded conversations saved to the account, with a thread list, a new-thread action and a real URL per thread so a conversation can be reopened on any device.

## 2. The differentiators

**Call journal + grading.** Every coach recommendation is recorded with the market state that produced it. The user can also log their own entries and exits. Once the persisted market history catches up, each call is graded — did it age well, and why. Users get a visible track record for the coach *and* for themselves. No competing dashboard shows its own hit rate.

**Behavioural risk profile.** The coach quietly scores the user's patterns from their journal and alert reactions: chasing pumps, panic-exiting, over-concentration, ignoring exit pressure. It surfaces a personal risk profile and warns *before* a repeat mistake ("this is the third time you've bought a 40% daily candle").

**Scenario simulator.** "What if BTC drops 8%?" — the coach replays the watchlist through the correlation and risk layers and reports the likely damage and which holdings are most exposed. Also works for upside and rotation scenarios.

**Proactive coach alerts.** Beyond threshold alerts, the coach itself decides when to speak: regime flip against the user's positions, exit pressure building on a watchlist coin, a narrative the user is already exposed to going parabolic. Delivered through the existing notification bell and channels, with the coach's reasoning attached.

## 3. Build order

1. Coach foundation — chat sidebar, threads, tier + experience adaptation, module context.
2. Daily briefing and per-module explainer on top of the same engine.
3. Call journal and grading (needs the persisted market history that already exists).
4. Behavioural risk profile.
5. Scenario simulator.
6. Proactive coach alerts wired into the existing alert delivery pipeline.

## Technical notes

- Coach runs server-side through Lovable AI (`openai/gpt-5.6-sol` on the Responses API), streaming, with tools that read the existing snapshot (`getBrainServerSnapshot`, `buildAlertMetrics`), the user's watchlist, alerts and journal through RLS. Tool access is gated by `tier-matrix.ts` so locked modules stay locked.
- Chat UI built with AI Elements (conversation, message, prompt-input, tool, shimmer) rather than hand-rolled bubbles.
- New tables, each with explicit GRANTs and owner-scoped RLS: `coach_threads`, `coach_messages`, `coach_calls` (journal + grade), `coach_profile` (experience level, behavioural scores), `coach_usage` (per-day message budget by tier).
- Experience level added to onboarding and Account settings.
- Grading and proactive alerts run inside the existing `/api/public/evaluate-alerts` cron pass, reusing `alert-delivery.server.ts`.
- Every coach output carries the "market intelligence, not financial advice" framing already used across the app.
