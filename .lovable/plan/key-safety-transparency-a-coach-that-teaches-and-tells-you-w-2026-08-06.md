# Key Safety Transparency + A Coach That Teaches and Tells You When to Stop

Three things: make key handling honest and obvious, make the Coach explain like you're five, and give it a clear "trade / don't trade" verdict.

## 1. Honest answer on API keys

One correction first: today the app **does** store exchange keys — encrypted with AES-256-GCM, decrypted only inside the server at the moment of a sync or an order. They have to be stored, otherwise the portfolio could never refresh on its own and Autopilot could never act. So the site must not say "we don't store your details" — that would be untrue and would damage trust the first time someone looked.

What is true, and what we will say plainly:

- Keys are encrypted before they touch the database; nobody browsing the data sees anything readable.
- The secret is never sent back to the browser after you type it — the app only ever shows the last 4 characters of the key.
- Read-only is the default. Trading permission is opt-in.
- **Withdrawal permission is never accepted.** Funds cannot leave the exchange through EliteFlux.
- Delete a connection and the encrypted credentials are erased immediately.
- Wallet addresses are public addresses only — no keys, no signing, ever.

### What gets built

- A **Key Safety** panel on the Portfolio page: the six points above, plus a step-by-step "how to create a safe key" walkthrough per exchange (disable withdrawals, enable IP whitelist where supported, read-only unless you want Autopilot).
- The same summary inline above the key form, and a required "I created this key without withdrawal permission" acknowledgement before connecting.
- A **Delete key** action with an explicit confirmation that says exactly what is erased.
- A short **Security** section on the public site explaining the same in plain language, so people can read it before signing up.
- Optional, and recommended: a **read-only only** account setting that blocks trade-permission keys from being added at all, for users who never want automation.

## 2. Coach explains like you're five

The Coach already adapts to four experience levels. Two additions:

- A hard rule in the beginner persona: explain every term the moment it appears, use everyday comparisons, never more than one idea per sentence, and end with "what this means for you" in one line.
- An **Explain simpler** button under every Coach answer that re-asks the same question at baby-steps level, so any user at any level can drop down instantly.
- A "What does this mean?" tap on dashboard scores that opens the Coach pre-loaded with a plain-English explanation of that specific number.

## 3. When to trade and when to stop

The Coach gains a clear, always-available verdict instead of leaving the user to interpret scores.

- A new **trading conditions** tool: reads the live engine and returns one of **Green (conditions favour acting), Amber (be selective), Red (stand down)** with the two or three reasons behind it and the condition that would flip it.
- A rule that whenever the user asks anything action-shaped ("should I buy", "is now a good time"), the Coach leads with that verdict, then the reasoning, then what would change its mind.
- **Stop-trading triggers** the Coach will call out unprompted: risk-off regime, rising exit pressure, an overheated pump-pressure band, and the user's own logged behaviour (revenge trading, over-trading, chasing) — drawn from the profiling that already exists.
- A **Stand-down banner** at the top of the Coach and dashboard when the engine is in a Red state, with one line saying why.
- Non-advice wording preserved throughout: this is market conditions and education, never "buy this".

## Technical notes

- Copy and UI changes in `src/routes/portfolio.tsx`, a new `KeySafety` component, and a new public security section.
- Coach: new `get_trading_conditions` tool in `src/lib/coach.server.ts` deriving the traffic light from flux score, regime, exit pressure, pump pressure and v3 confidence; persona rules extended in `buildCoachSystemPrompt`; beginner style tightened in `coach-shared.ts`.
- "Explain simpler" sends a follow-up turn with a level override; no schema change.
- Optional read-only-only preference is one boolean on the profile, enforced server-side in `connectExchange`.
- No change to how keys are encrypted — the vault is already correct; the gap is disclosure, not cryptography.
