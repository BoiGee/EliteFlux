import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — re-checks payments that were left pending because the
// chain lookup was unavailable at submission time, and activates the plan when
// the transfer now confirms. Idempotent and safe to run often. The job body
// lives in @/lib/jobs.server so the in-process scheduler can run it directly.
export const Route = createFileRoute("/api/public/settle-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runSettlePaymentsJob } = await import("@/lib/jobs.server");

        try {
          const result = await runSettlePaymentsJob(supabaseAdmin as never);
          return Response.json(result);
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
        }
      },
      GET: async () => new Response("Use POST", { status: 405 }),
    },
  },
});
