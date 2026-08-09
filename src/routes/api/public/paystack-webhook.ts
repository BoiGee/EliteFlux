import { createFileRoute } from "@tanstack/react-router";

// Inbound webhook from Paystack — NOT one of our own apikey-secured cron
// endpoints. Trust comes from the x-paystack-signature header instead (HMAC-
// SHA512 of the raw body), verified before the body is ever parsed as JSON.
// Unknown/irrelevant event types are acknowledged with 200 rather than
// rejected — Paystack retries non-2xx responses indefinitely, and a 4xx/5xx
// on an event we simply don't act on would show up as a failing job for no
// reason.
export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { verifyWebhookSignature } = await import("@/lib/paystack.server");

        let signatureOk: boolean;
        try {
          signatureOk = verifyWebhookSignature(rawBody, request.headers.get("x-paystack-signature"));
        } catch (e) {
          // Missing PAYSTACK_SECRET_KEY etc. — configuration error, not a
          // signal to keep retrying, but also not safe to trust.
          return Response.json({ error: e instanceof Error ? e.message : "unavailable" }, { status: 500 });
        }
        if (!signatureOk) return new Response("Invalid signature", { status: 401 });

        const event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.event === "charge.success") {
          const reference = event.data?.["reference"] as string | undefined;
          if (reference) {
            const { settlePayment } = await import("@/lib/payments.server");
            await settlePayment(supabaseAdmin as never, reference);
          }
          return Response.json({ ok: true });
        }

        if (event.event === "subscription.disable") {
          const subscriptionCode = event.data?.["subscription_code"] as string | undefined;
          if (subscriptionCode) {
            // Only cancellation-state — never touch current_period_end/tier
            // here. The plan simply isn't renewed; expire-subs already
            // downgrades it generically once the paid-up period passes.
            await supabaseAdmin
              .from("subscriptions")
              .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
              .eq("paystack_subscription_code", subscriptionCode);
          }
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true, ignored: event.event ?? "unknown" });
      },
      GET: async () => new Response("Use POST", { status: 405 }),
    },
  },
});
