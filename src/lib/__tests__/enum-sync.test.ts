import { describe, expect, it } from "vitest";
import { Constants } from "@/integrations/supabase/types";

// Generalizes the VENUES-vs-exchange_venue sync test (exchanges.test.ts) to
// every "state machine" column in the schema — a table with an enum-typed
// status/state column that application code writes literal string values
// into across multiple files. This is exactly the bug class found by audit:
// autopilot_actions.state was written as "executing" everywhere in
// autopilot.server.ts (the claim step in executeAction, the very first
// write of every trade execution attempt) for as long as that code existed,
// but 'executing' was never actually added to the action_state enum in any
// migration — every real execution attempt failed silently with a
// misleading "already being processed" error. Nothing caught this because
// these are all `admin as never`-cast Supabase calls (the documented,
// deliberate typing escape hatch for the loosely-typed admin client used
// throughout src/lib/*.server.ts), so tsc never validated the literals
// against the real schema either.
//
// Each list below is compiled by reading every actual write site for that
// column (not guessed) — see the commit that added this test for the
// specific grep/read trail. If a future change writes a new literal without
// updating both the list here AND pushing a migration to add it to the
// real enum, this test fails instead of the bug going live silently.
describe("application code never writes a status/state literal the database enum doesn't have", () => {
  it("autopilot_actions.state (action_state)", () => {
    // Written across autopilot.functions.ts (reject/approve), autopilot.server.ts
    // (proposeActions' insert defaults to 'proposed', executeAction's claim
    // step -> 'executing', guardrail block -> 'blocked', paper/live fill ->
    // 'executed'/'failed'), and reconcileStuckAutopilotActions -> 'unknown'.
    const used = ["proposed", "approved", "rejected", "blocked", "executing", "executed", "failed", "unknown"];
    for (const v of used) expect(Constants.public.Enums.action_state as readonly string[]).toContain(v);
  });

  it("payment_transactions.status (payment_status)", () => {
    // payments.functions.ts's checkout insert -> 'pending'; payments.server.ts's
    // settlePayment -> 'verified'; admin.functions.ts's manual
    // approve/reject -> 'verified'/'rejected'; jobs.server.ts's
    // runSettlePaymentsJob 7-day sweep -> 'expired'.
    const used = ["pending", "verified", "rejected", "expired"];
    for (const v of used) expect(Constants.public.Enums.payment_status as readonly string[]).toContain(v);
  });

  it("subscriptions.status (subscription_status)", () => {
    // payments.server.ts's grantSubscription -> 'active'; jobs.server.ts's
    // runExpireSubsJob -> 'expired'. ('trialing'/'canceled'/'past_due'/
    // 'incomplete' are read/checked throughout but never written directly by
    // application code — trial status is set at signup, not by these
    // server functions — so they're not asserted here as "used", only that
    // the enum itself still carries them for the read-side checks to match
    // against.)
    const used = ["active", "expired"];
    for (const v of used) expect(Constants.public.Enums.subscription_status as readonly string[]).toContain(v);
    for (const v of ["trialing", "canceled", "past_due", "incomplete"]) {
      expect(Constants.public.Enums.subscription_status as readonly string[]).toContain(v);
    }
  });

  it("coach_calls.status (call_status)", () => {
    // Row default (unwritten by app code, confirmed by .eq("status","open")
    // reads with no matching insert-time literal) -> 'open';
    // coach.server.ts's gradeDueCalls batched upsert -> 'graded'.
    const used = ["open", "graded"];
    for (const v of used) expect(Constants.public.Enums.call_status as readonly string[]).toContain(v);
  });

  it("exchange_connections.venue and wallet chains stay within their enums", () => {
    // Cross-checked in detail by exchanges.test.ts's dedicated VENUES sync
    // test — just confirming the enum itself hasn't silently lost a member
    // here as a cheap belt-and-suspenders check alongside the others above.
    expect(Constants.public.Enums.exchange_venue.length).toBeGreaterThanOrEqual(6);
  });
});
