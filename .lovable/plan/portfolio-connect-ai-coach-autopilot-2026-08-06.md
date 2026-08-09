# Portfolio Connect + AI Coach Autopilot

Yes to both — with one important constraint up front. There is no ready-made exchange integration available on this platform, so exchange access is custom-built with the user's own API keys. And because level 3 (full auto) actually places orders with the user's money, the build ships with paper trading on by default and a hard arming step before anything is live.

## Part 1 — Autonomy levels

A four-level dial on the coach, set per user and changeable any time.

| Level | Name | What the coach does |
|---|---|---|
| 0 | Observe | Answers questions only. Never suggests an action. |
| 1 | Advise | Proposes concrete actions in chat ("trim SOL 25%") — user acts elsewhere. |
| 2 | Approve | Queues actions in an Action Inbox; nothing happens until the user taps approve. |
| 3 | Autopilot | Executes automatically inside the user's guardrails, then reports what it did. |

Level 3 requires: Elite plan, a connected exchange with trade permission, guardrails saved, risk disclosure accepted, and a typed confirmation to arm. Levels 0–2 are available to everyone.

### Guardrails (all user-set, enforced server-side)
- Max % of portfolio per single trade, and a hard max notional per trade
- Max trades per day and max total traded value per day
- Allowed assets (defaults to the user's watchlist) and a never-touch list
- Minimum conviction score before the coach may act
- Exits go to stablecoins only — no leverage, no margin, no withdrawals, ever
- Cooldown between trades on the same asset
- Drawdown circuit breaker: if the portfolio drops X% in 24h, autopilot disarms itself
- Global kill switch, always one tap away in the top bar

Every guardrail is re-checked at execution time on the server. A client can never widen its own limits.

## Part 2 — Connecting real holdings

Two sources, merged into one portfolio view.

**Exchange API keys (Binance, Bybit, OKX to start)**
The user creates a key in their exchange with read-only permission — or read + spot trade if they want level 3 — and pastes it into EliteFlux. Keys are encrypted before storage and only ever decrypted inside the server at call time. We instruct users to disable withdrawal permission and, where the exchange supports it, to IP-whitelist.

**Wallet addresses (EVM + Solana)**
Public addresses only. No keys, no signing, read-only balances. Wallets are never traded on — they feed the portfolio picture and the coach's context.

The coach gains portfolio-aware tools, so instead of generic reads it can say "your SOL is 38% of the book and exit pressure is rising on it."

## Part 3 — How autopilot runs

On each scheduled intelligence run:
1. Refresh portfolios for users with autopilot armed.
2. Score their holdings and watchlist against the live intelligence layers.
3. Turn qualifying signals into candidate actions.
4. Run every candidate through that user's guardrails; drop anything that fails.
5. Execute (or, at level 2, queue for approval), then log the order with its full reasoning.
6. Notify through the channels the user already configured (in-app, email, Telegram, webhook).

Every action — proposed, skipped, executed, failed — is written to an audit trail the user can read and export. Nothing the autopilot does is invisible.

## Rollout

1. **Autonomy dial + Action Inbox** (levels 0–2). Works immediately with no exchange connection.
2. **Portfolio connect**: read-only exchange keys + wallet addresses, portfolio dashboard, portfolio-aware coach.
3. **Paper autopilot** (level 3, simulated). Real signals, real guardrails, fake fills — so users and you can see how it would have performed before risking anything.
4. **Live autopilot**: unlocks per user after a paper track record, with arming, kill switch and circuit breaker.

## Technical notes

- New tables: `exchange_connections` (encrypted key + secret, permission scope, status), `wallet_addresses`, `portfolio_holdings` (synced snapshot), `autopilot_settings` (level + guardrails + armed state), `autopilot_actions` (proposal, decision, guardrail verdict, order result, reasoning), `autopilot_audit`. All RLS-scoped to the owner, with grants; secret material readable only by the service role.
- Encryption: AES-256-GCM in server-only code, key from a generated project secret. Ciphertext in the database, never plaintext — the raw exchange secret is never returned to the browser after entry.
- Exchange calls are signed HMAC requests made from server functions only. Order placement lives behind one execution module so every venue passes through the same guardrail check.
- Autopilot runs inside the existing scheduled evaluator alongside alert evaluation and journal grading, reusing the current market snapshot rather than re-fetching.
- The coach gains tools for portfolio read, exposure/concentration analysis, and action proposal; the proposal tool always writes to `autopilot_actions` rather than executing directly, so level 2 and level 3 share one code path.
- Legal: a plain-language risk disclosure with recorded acceptance before arming, and non-advice wording kept throughout. Automated trading on behalf of users can carry licensing obligations depending on your jurisdiction — worth checking before turning live mode on for the public.

## What this plan does not do

No leverage, futures, margin, or withdrawals. No custody of user funds. No key with withdrawal permission is accepted.
