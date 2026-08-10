import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { priceFor } from "./payments.config";

const InitializeSchema = z.object({
  tier: z.enum(["pro", "elite"]),
  cycle: z.enum(["monthly", "yearly"]),
});

/**
 * Start a Paystack checkout: creates the pending payment_transactions row
 * first (its id doubles as the Paystack reference and provider_ref, so the
 * webhook and the post-redirect callback both resolve to the same row with
 * no separate mapping step), then asks Paystack for a hosted checkout URL.
 */
export const initializePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InitializeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { isFeatureEnabled } = await import("./platform.server");
    if (!(await isFeatureEnabled(supabaseAdmin as never, "payments"))) {
      return { ok: false, message: "Upgrades are temporarily unavailable. Please try again shortly." };
    }

    const { checkRateLimit } = await import("./rate-limit.server");
    const throttle = await checkRateLimit(supabaseAdmin as never, userId, "payment_init", 10, 10 * 60_000);
    if (!throttle.allowed) {
      return {
        ok: false,
        message: `Too many checkout attempts. Please wait ${Math.ceil(throttle.retryAfterSeconds / 60)} minute(s) and try again.`,
      };
    }

    const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();
    const email = (profile as { email: string | null } | null)?.email;
    if (!email) return { ok: false, message: "Your account has no email on file — contact support." };

    const reference = randomUUID();
    const expected = priceFor(data.tier, data.cycle);

    const { error: insErr } = await supabaseAdmin.from("payment_transactions").insert({
      id: reference,
      user_id: userId,
      provider: "paystack",
      provider_ref: reference,
      tier: data.tier,
      cycle: data.cycle,
      expected_amount: expected,
      status: "pending",
    });
    if (insErr) return { ok: false, message: insErr.message };

    const { getOrCreatePlanCode, initializeTransaction } = await import("./paystack.server");
    const plan = await getOrCreatePlanCode(supabaseAdmin as never, data.tier, data.cycle);
    const appUrl = process.env["APP_URL"] ?? "https://elite-flux.com";

    const result = await initializeTransaction({
      email,
      reference,
      planCode: plan.planCode,
      amount: plan.amount,
      callbackUrl: `${appUrl}/pricing`,
    });

    if (!result.ok || !result.authorizationUrl) {
      await supabaseAdmin
        .from("payment_transactions")
        .update({ status: "rejected", notes: result.message ?? "Could not start checkout." })
        .eq("id", reference);
      return { ok: false, message: result.message ?? "Could not start checkout." };
    }

    return { ok: true, authorizationUrl: result.authorizationUrl };
  });

/** Re-check a payment (post-redirect instant feedback, or a manual retry). */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: tx } = await supabaseAdmin
      .from("payment_transactions")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!tx) return { ok: false, message: "Not found" };

    const { settlePayment } = await import("./payments.server");
    const result = await settlePayment(supabaseAdmin as never, data.id);
    return { ok: result.ok, message: result.message };
  });
