# Hand-Holding for People Who Have Never Made an API Key

Right now the Portfolio page assumes the user already knows what an API key is and where to find it. The Key Safety panel lists terse per-exchange steps in three small columns — useful as a reference, useless as a first-time walkthrough. This adds a beginner path that assumes zero knowledge.

## 1. "I've never done this" starter

At the very top of the Portfolio connect area, before any form fields:

- A short plain-English framing: what an API key actually is (a read-only viewing pass for your exchange account, like giving someone a window not a door), why we need one, and what it cannot do.
- Two buttons: **Walk me through it** (opens the guided wizard) and **I know what I'm doing** (collapses straight to the current form).
- A third, softer option for the truly cautious: **Just track a wallet address instead** — no keys at all — which scrolls to and highlights the wallet panel.

## 2. Guided connection wizard

A step-by-step dialog, one instruction per screen, with a progress dot row. Chosen exchange first, then:

1. **Log in to your exchange** — where the API section lives, with the exact menu path spelled out in words ("click your profile picture, top right → API Management").
2. **Create the key** — what to name it, what "system generated" means.
3. **Set permissions** — the critical screen. Read = ON. Withdrawals = OFF, stated twice. Spot trading only if they want Autopilot, with a one-line consequence of each choice.
4. **Copy the key and secret** — warns the secret shows once; tells them what to do if they lost it (delete, make a new one).
5. **Paste it here** — the key/secret/passphrase fields live inside the final step, so they never have to remember where to go back to. The no-withdrawal acknowledgement sits here too.

Each step has a "What does this mean?" link that opens the Coach with that exact question pre-loaded, so a confused user gets a plain-language answer without abandoning the flow. The wizard is resumable — closing keeps the step and the exchange choice.

## 3. Plain-language glossary

Small inline definition popovers on the words a beginner will stumble on: API key, secret, passphrase, read-only, withdrawal permission, IP whitelist, spot trading. One sentence each, no jargon inside the definition.

## 4. If it fails, say what to do

Connection errors today surface the raw exchange message. Map the common ones to a human next step:

- invalid key / signature → "The key or secret was pasted with a missing character or a space. Copy them again."
- permission denied → "This key does not have reading enabled. Create a new one with Read switched on."
- IP restricted → "Your key is locked to specific IP addresses. Remove the restriction or contact us for our address."
- timestamp errors → "Your exchange rejected the request timing. Try again in a moment."

The raw message stays available under a "technical detail" toggle.

## 5. Empty-state nudge

When nothing is connected, the portfolio empty state stops being one grey sentence and becomes three plain choices: track a wallet (easiest, no key), connect read-only (see everything), connect with trading (let Autopilot act) — each with one line on what it unlocks.

## Technical notes

- New `src/components/eliteflux/ConnectWizard.tsx` holding step content per venue, driven by a `step`/`venue` state pair; reuses the existing `connectExchange` mutation rather than duplicating it.
- `src/routes/portfolio.tsx` gains the beginner/expert toggle and mounts the wizard; the existing inline form stays as the expert path so nothing regresses.
- Glossary as a small `Term` component wrapping shadcn Popover; definitions in one shared map.
- Error mapping as a pure `friendlyConnectError(message)` helper in `src/lib/portfolio.schemas.ts` (shared, no server change).
- "What does this mean?" reuses the existing Coach pre-load pattern already used by dashboard scores.
- No database, server function, or encryption changes.
