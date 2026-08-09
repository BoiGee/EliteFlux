import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Toggle cancel-at-period-end on the user's current subscription. Also stops
// the actual Paystack auto-charge — otherwise the customer would keep being
// billed after believing they'd cancelled. User keeps access until
// current_period_end either way; the expire-subs cron downgrades after.
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cancel: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,tier,status,paystack_subscription_code,paystack_email_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub) return { ok: false, message: "No subscription found." };
    if (sub.tier === "free") return { ok: false, message: "Nothing to cancel — you're on the free plan." };

    // Only real Paystack subscriptions have these — an admin-granted plan
    // (setUserPlan) or a trial has nothing to disable upstream.
    if (data.cancel && sub.paystack_subscription_code && sub.paystack_email_token) {
      const { disableSubscription } = await import("./paystack.server");
      const result = await disableSubscription({
        code: sub.paystack_subscription_code,
        token: sub.paystack_email_token,
      });
      if (!result.ok) return { ok: false, message: result.message ?? "Could not stop auto-renewal with Paystack." };
    }

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        cancel_at_period_end: data.cancel,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (error) return { ok: false, message: error.message };
    // Paystack subscriptions can't be un-disabled via the API once cancelled —
    // this flag only affects whether the expire-subs cron is allowed to
    // extend the plan; if it was actually disabled at Paystack, resuming
    // auto-charge requires a fresh checkout once the current period ends.
    return {
      ok: true,
      message: data.cancel
        ? "Auto-renewal disabled. Your plan stays active until the end of the current period."
        : "Auto-renewal re-enabled for this period. If it was already stopped with Paystack, you'll need to check out again once the current period ends.",
    };
  });
