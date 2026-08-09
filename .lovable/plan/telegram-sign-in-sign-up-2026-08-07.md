# Telegram Sign-in & Sign-up

Add "Continue with Telegram" alongside the existing Google and email/password options, without touching any working auth path.

## How it works for the user

1. On the sign-in page they tap **Continue with Telegram**.
2. Telegram's official login widget opens and asks them to confirm.
3. They land back in EliteFlux signed in — first time through, an EliteFlux account is created automatically.
4. Their Telegram handle and chat ID are saved on their profile, so alert delivery to Telegram works immediately with no extra setup.

Telegram never shares an email address, so accounts created this way use an internal, non-mailable address. Consequence: a Telegram-created account cannot use email password reset — they keep signing in with Telegram. Existing accounts are untouched; a signed-in user can also link Telegram from the Account page instead of creating a second account.

## What gets built

- **Login/consent pages**: a Telegram button + widget on `/login`, honouring the existing `next` redirect (so OAuth consent and deep links still return correctly). Invite-only gating still applies to first-time Telegram sign-ups.
- **Server verification**: a server function that validates Telegram's signed payload (HMAC over the bot token, with a freshness check on `auth_date`) and rejects anything unverified. No trust is placed on the browser.
- **Account creation / linking**: on first verified login, create the auth user (which fires the existing profile/role/subscription/watchlist trigger), store the Telegram identity, then hand the browser a session. Returning users are matched by their Telegram ID and signed straight in.
- **Account page**: "Link Telegram" / "Unlink Telegram" for existing users, which also fills the alert `telegram_chat_id`.
- **Database**: add `telegram_user_id` (unique) to profiles so Telegram identities map to exactly one account; keep existing `telegram_handle` / `telegram_chat_id` behaviour.

## What it needs from you

Telegram login requires the bot's own token and username, and the bot must have this app's domain registered in BotFather (`/setdomain`). I'll request:

- `TELEGRAM_BOT_TOKEN` — the raw token from BotFather (separate from the existing alerts connector key)
- `TELEGRAM_BOT_USERNAME` — e.g. `EliteFluxBot`

Set the domain to the published site (`elitefluxx.lovable.app`) — the widget refuses to render on unregistered domains, including preview URLs.

## Technical notes

- Verification: `HMAC_SHA256(data_check_string, SHA256(bot_token))` compared timing-safe, `auth_date` within 5 minutes, in a server function (never in the browser).
- Session issuance: server-side admin lookup/creation of the auth user, then a one-time link/OTP exchanged for a real Supabase session client-side — no tokens in URLs, no service-role key exposed.
- Synthetic address format: `tg-<telegram_user_id>@telegram.eliteflux.local`, auto-confirmed for this path only; email/password signup keeps its current confirmation flow.
- New migration includes GRANTs and RLS policies consistent with the existing `profiles` table; `telegram_user_id` is unique to prevent account takeover by handle reuse.
- Google, email/password, MCP OAuth consent and alert delivery paths are left unchanged.
