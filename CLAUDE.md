# EliteFlux — instructions for Claude

## Keep Flux the AI Coach current

`src/lib/coach-knowledge.ts` is Flux's own knowledge of the product — it's what
the coach reads to answer "what does this do," "how do I use it," and "what's
new." It is not auto-derived from the code; it has to be hand-updated.

**Whenever you ship a change that affects what a user can do, see, or should
know — add or edit an entry in `coach-knowledge.ts` in the same change.** This
includes:

- A new feature, or a materially changed one → add/update a `FEATURES` entry.
- A tier boundary changing (what's Free/Operator/Elite) → update the relevant
  `FEATURES[].plan` and the `PLANS` bullet lists — keep them in agreement with
  `src/lib/tier-matrix.ts`'s `TIER_ACCESS`, since Flux will confidently repeat
  whatever this file says even if the code disagrees.
- A user-visible fix, especially one to something previously broken or
  misleading (a safety control that now actually works, a number that's now
  computed correctly, a label that was overclaiming) → add a `CHANGELOG` entry
  in plain, honest, non-marketing language, matching the existing entries'
  tone. Skip pure security/backend hardening with no user-visible behavior
  change (rate limits, encryption internals) — CHANGELOG is user-facing.
- A new step in an existing flow (connecting a wallet, arming Autopilot) →
  update the relevant `HOW_TO` steps.

If you're not sure whether something is user-relevant enough for the
changelog, err toward adding it — a stale or missing entry means Flux either
can't answer a question it should, or answers it wrong.

## Deploy after changes intended for production

EliteFlux runs on Cloudflare Workers, live at **elite-flux.com** (and
**www.elite-flux.com**), configured via the root `wrangler.jsonc`. There is no
separate staging environment — a change isn't live until it's built and
deployed.

After making changes meant to reach production, run:

```
npx tsc --noEmit
npx vitest run
npx vite build
npx wrangler deploy --config .output/server/wrangler.json
```

(`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must be set in the
environment for the deploy step.) Confirm the typecheck, tests, and build all
pass *before* deploying — don't push a build that hasn't been verified.

If the change includes a new Supabase migration (`supabase/migrations/`), push
it before deploying code that depends on it:

```
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push
```

and regenerate `src/integrations/supabase/types.ts` against the linked
project afterward so the typed client stays in sync with the real schema.

Background jobs run via Cloudflare Cron Triggers (see `wrangler.jsonc`'s
`triggers.crons` and `src/lib/scheduler.server.ts`'s `CRON_JOBS`) — those two
lists must stay in exact sync (`src/lib/__tests__/scheduler.test.ts` checks
this). If you add or change a scheduled job, update both.

## Cloudflare Workers runtime constraints

This codebase originally assumed a persistent Node/Bun process. On Workers,
**no async I/O, timers, or crypto/random generation may run at module top
level** — only inside a request handler or the `scheduled` handler in
`src/server.ts`. A top-level `setTimeout`/`setInterval`/`fetch()` call will
crash every request with "Disallowed operation called within global scope."
If you add new top-level initialization, guard it the way `src/server.ts`
already does (check `navigator.userAgent === "Cloudflare-Workers"`) or move it
inside a handler.
