# Wire up the EliteFlux banner / link preview

Goal: when anyone shares an EliteFlux link on X, Telegram, WhatsApp, Slack, LinkedIn or iMessage, they see your branded banner instead of a raw screenshot.

## Current state

- The root layout currently points social previews at an auto-captured preview screenshot URL (a temporary R2 screenshot link), and it sits on the root — which means every page shares the exact same preview.
- No banner artwork exists in the project yet (`src/assets` only holds the logo and coach mark).

## What I'll build

1. **Add the banner asset**
   - Take the banner image you provide, produce a 1200x630 social-preview version (the size every platform crops to), and store it so it is served from a stable public URL.
   - Keep the original full-resolution file for in-app use.

2. **Replace the temporary preview image**
   - Remove the screenshot URL from the root layout (root-level preview images override every page).
   - Put the banner on the individual pages instead, so each page gets a correct, self-referencing preview.

3. **Per-page previews**
   - Home / landing, Why EliteFlux, Pricing, Security, Welcome, and the legal pages each get: page-specific title and description, the banner as preview image, a self-referencing page URL, and Twitter large-image card formatting.

4. **Optional in-app use**
   - If the banner suits it, use it as the hero visual on the landing page and the Why EliteFlux page header. I'll only do this if it reads well at wide aspect — otherwise it stays preview-only.

## What I need from you

Send the banner artwork in chat. Ideal: a wide image (roughly 1200x630 or any 1.91:1 crop), with the logo and "EliteFlux" wordmark comfortably inside the centre so nothing gets cut off on mobile previews.

If you'd rather I generate one on-brand with the existing deep-navy/neon palette and your logo, say so and I'll produce it instead.

## Note on timing

Social platforms cache previews. After this ships, an already-shared link may keep showing the old image until the platform re-scrapes; you can force it in each platform's link preview debugger.

## Technical details

- Banner optimized to 1200x630 JPEG/PNG and referenced by absolute `https://elitefluxx.lovable.app/...` URL (social crawlers reject relative paths).
- `og:image` / `twitter:image` removed from `src/routes/__root.tsx`, added per leaf route `head()`.
- Each content route gets `og:title`, `og:description`, `og:url`, `og:type`, `twitter:card: summary_large_image`, and a self-referencing `canonical` link (leaf routes only, never root).
