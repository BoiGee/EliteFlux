# Custom Logo, Favicon and Social Banner

Replace the built-in lightning-bolt mark and the styled "EliteFlux" text with your own artwork, everywhere they appear.

## Order of work

You said logo first, then favicon, then banner. Same order here — attach the logo file in your next message and I'll start.

1. **Logo** — replace the mark + wordmark across the app.
2. **Favicon** — derived from the logo you send, or a separate file if you prefer.
3. **Banner** — used only as the link-preview image (og:image / twitter:image).

## 1. Logo

A single shared `BrandLogo` component so future changes are one edit. It renders your image and accepts a size, so the same asset is used at every scale.

Places it replaces the current bolt icon + "Elite**Flux**" text:

- Sidebar header (desktop)
- Mobile menu header
- Top bar (currently the small "EF" square)
- Landing page header and its footer
- Site footer
- Legal pages header (privacy, terms, refunds, security)
- Login, reset-password, account, pricing pages
- Why EliteFlux page
- OAuth consent screen

Since you chose icon + text, the wordmark comes from your image. Where space is tight (mobile top bar, sidebar collapsed states) I'll show the mark-only crop if you send one; otherwise the full logo scaled down.

## 2. Favicon

Downscaled to a square 64x64 PNG at `public/favicon.png`, padded rather than stretched so a wide logo keeps its proportions. Wired into the root route's head links, and the old `public/favicon.ico` removed so stale icons aren't served.

## 3. Banner

Stored as an app asset and referenced by absolute URL in `og:image` and `twitter:image` on the root route, replacing the current auto-generated screenshot. Best at 1200x630. Note: platforms cache link previews, so shared links may show the old image until their crawler refetches.

## Technical notes

- Images go in `src/assets/` and are imported as ES modules; large files are moved to CDN asset pointers.
- Every logo instance gets meaningful `alt` text ("EliteFlux") except decorative duplicates next to visible text.
- No changes to layout logic, routing, or business code — presentation only.

## What I need from you

Attach the **logo** now. Ideal: PNG or SVG with transparent background. If you have both a full lockup (mark + wordmark) and a standalone square mark, send both — the square one makes a much better favicon.
