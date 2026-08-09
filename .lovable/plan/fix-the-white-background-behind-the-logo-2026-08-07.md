# Fix the white background behind the logo

## What's actually going on

The uploaded logo file is not transparent. It has an alpha channel, but every pixel is opaque — the outer pixels read as a solid near-white (RGB 225,225,225). So the "transparency" never made it into the file, and the app faithfully renders the white plate around the mark.

The current copy in the project only looks partly fixed because the edges were trimmed and re-padded, which removed the outer white border but left the white area that sits directly around the artwork.

## The fix

1. Re-process the original upload: flood-fill the near-white background to transparent from the outer edges, with a tolerance high enough to catch the off-white and anti-aliased pixels but low enough to preserve the light highlights inside the mark itself.
2. Trim to the artwork, re-pad to a clean square, and export a fresh transparent PNG over the current `src/assets/eliteflux-logo.png`, so every place already using the brand components picks it up with no code changes.
3. Regenerate `public/favicon.png` from the corrected transparent source.
4. Verify: check the corner and background pixels are fully transparent, then capture the header, footer, login page and dashboard top bar in the preview to confirm no white box remains on the dark navy surface.

If a flood fill leaves halos or eats into the mark, fall back to the AI background-removal tool on the original upload and repeat steps 2 to 4.

## Notes

No component or layout changes — this is an asset correction only. `BrandMark` / `BrandLockup` and all their usages stay as they are.
