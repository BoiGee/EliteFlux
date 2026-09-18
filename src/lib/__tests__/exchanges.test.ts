import { describe, expect, it } from "vitest";
import { looksLikeDuplicate, VENUES } from "../exchanges.server";
import { Constants } from "@/integrations/supabase/types";

// This is the one piece of tonight's idempotency-key work that's a pure
// function — everything else in exchanges.server.ts makes live HTTP calls to
// real exchanges and isn't unit-testable without introducing a mocking layer
// this test suite doesn't have. But this function is exactly the thing
// deciding whether a rejected order gets treated as "safe to retry" or
// "may have already filled, don't trust either label" — worth locking in.
describe("looksLikeDuplicate", () => {
  it("matches a reused-order-id rejection regardless of venue wording", () => {
    expect(looksLikeDuplicate("Duplicate order sent.")).toBe(true); // Binance
    expect(looksLikeDuplicate("orderLinkId is duplicate")).toBe(true); // Bybit
    expect(looksLikeDuplicate("Order already exists")).toBe(false); // OKX wording has no "duplicate" — caught by sCode instead, not this heuristic
    expect(looksLikeDuplicate("DUPLICATE ORDER")).toBe(true); // case-insensitive
  });

  it("does not flag ordinary rejections as duplicates", () => {
    expect(looksLikeDuplicate("Insufficient balance")).toBe(false);
    expect(looksLikeDuplicate("Invalid symbol")).toBe(false);
    expect(looksLikeDuplicate("Invalid Amount Sent")).toBe(false);
  });

  it("handles a missing message without throwing", () => {
    expect(looksLikeDuplicate(undefined)).toBe(false);
    expect(looksLikeDuplicate("")).toBe(false);
  });
});

// VENUES (exchanges.server.ts, hand-maintained) and the generated
// exchange_venue Postgres enum (types.ts, regenerated from the real schema)
// must name the exact same set — a mismatch means either the UI/connect
// flow offers a venue the database can't actually store, or the database
// accepts one the UI never offers. Held back until the
// 20260918050000_add_exchange_venues.sql migration was pushed and types.ts
// regenerated against it, mirroring scheduler.test.ts's wrangler.jsonc/
// CRON_JOBS sync check.
describe("VENUES stays in sync with the generated exchange_venue enum", () => {
  it("has exactly the same venues as the database enum", () => {
    const dbVenues = Constants.public.Enums.exchange_venue;
    expect([...VENUES].sort()).toEqual([...dbVenues].sort());
  });
});
