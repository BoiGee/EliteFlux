# Fix: Telegram confirms, but the app stays on the sign-in page

## What we know

The Telegram widget renders and the confirmation completes, but the browser never lands on the dashboard. I checked the backend: there are no server-function logs and no auth logs from the attempt, so there is no evidence yet that the sign-in request ever reached our server. That points at the browser-side handoff (Telegram's callback into our page), not at the verification code — but the cause is unconfirmed, so step 1 is to confirm it rather than assume.

## Step 1 — Confirm where it breaks

Add temporary, non-sensitive breadcrumbs on the sign-in path:

- log when the Telegram callback fires (and that a payload arrived),
- log the outcome of the server verification call,
- log the outcome of the session exchange,
- always show any failure in the page's error banner instead of failing silently.

Then reproduce once on the live site and read the logs. That tells us which of three things happened: callback never fired, server rejected the login, or the session exchange failed.

## Step 2 — Make the handoff robust (the likely fix)

Replace the fragile in-page callback with Telegram's redirect flow, which does not depend on a JavaScript global surviving the popup:

- Telegram redirects back to a dedicated page on our site with the signed login data in the URL.
- That page verifies the data with the server, exchanges the one-time token for a session, and then sends the user to their intended destination (honouring the existing `next` redirect).
- If verification fails, it returns to sign-in with a clear message rather than a blank state.

The existing button stays visually identical; only the return path changes.

## Step 3 — Cover the "already signed in" edge

If the session is created but the page doesn't move, the redirect after sign-in is at fault. The sign-in page will wait for a confirmed session before navigating, then do a full navigation so the app re-reads the session — no silent stall.

## Guardrails

- No change to Google, email/password, password reset, invite gating, or Telegram alert delivery.
- Server-side signature and freshness checks stay exactly as they are; the redirect data is verified the same way.
- Temporary breadcrumbs contain no tokens, no Telegram IDs, no emails, and are removed once the fix is confirmed.

## Technical notes

- Widget switches from `data-onauth` to `data-auth-url` pointing at a new public route (e.g. `/auth/telegram`) that carries `next` through the round trip.
- The callback route parses Telegram's query params, calls the existing `telegramSignIn` server function, then `supabase.auth.verifyOtp({ type: "magiclink", token_hash })`, awaits a confirmed session via `getSession()`, and only then navigates.
- Account-page linking keeps the current in-page callback since the user is already signed in there; it will get the same error surfacing.
