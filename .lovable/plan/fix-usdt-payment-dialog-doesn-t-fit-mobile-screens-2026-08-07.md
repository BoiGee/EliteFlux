# Fix: USDT payment dialog doesn't fit mobile screens

## The problem

The payment dialog is a full-screen overlay that centres its card (`fixed inset-0 … grid place-items-center p-4`). The card itself has no height limit and no scrolling, so on a phone the content — amount box, network row, address + QR code, warning text, TXID field, Tronscan link, result message and submit button — is taller than the viewport. Once the transaction hash is pasted, the extra Tronscan link and any result banner push the Submit button off-screen with no way to scroll to it. On-screen keyboards make it worse because the visible viewport shrinks further.

## What to change

All changes are presentation-only, inside `src/components/eliteflux/UsdtPaymentDialog.tsx`.

1. **Make the dialog scrollable.** Cap the card at the dynamic viewport height (`max-h-[100dvh]` minus padding) and let its body scroll, so nothing can ever be unreachable.

2. **Split the card into three regions** so the important controls stay visible:
   - Sticky header: title, subtitle, close button.
   - Scrollable middle: cycle toggle, amount, network, address + QR, warnings, TXID input, Tronscan link, result message.
   - Sticky footer: the Submit & Verify button, pinned to the bottom of the card so it is always tappable while the middle scrolls.

3. **Tighten the mobile layout** so less scrolling is needed: smaller paddings and spacing below `sm`, a smaller QR code on phones (scaling back up at `sm`), and the address block allowed to wrap without pushing width.

4. **Keyboard and safe-area handling.** Add bottom safe-area padding to the footer and make sure the focused TXID field scrolls into view rather than being hidden behind the keyboard.

5. **Overlay behaviour.** Keep tap-outside-to-close, but ensure scrolling inside the card doesn't trigger the close handler, and prevent background page scroll while the dialog is open.

## Verification

Drive the pricing page in a browser at 360x640 and 390x844, open the dialog for both Pro and Elite, paste a 64-character hash, and screenshot to confirm the Submit button stays visible and every field is reachable. Confirm desktop layout is unchanged at 1280px.

## Technical notes

Single file touched: `src/components/eliteflux/UsdtPaymentDialog.tsx`. No changes to payment logic, pricing, `submitPayment`, or on-chain verification.
