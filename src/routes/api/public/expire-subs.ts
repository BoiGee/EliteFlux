import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint. Idempotent. Marks expired subscriptions as `expired`
// and downgrades tier to `free`. The job body lives in @/lib/jobs.server so
// the in-process scheduler can run it without an HTTP round trip.
export const Route = createFileRoute("/api/public/expire-subs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runExpireSubsJob } = await import("@/lib/jobs.server");

        try {
          const result = await runExpireSubsJob(supabaseAdmin as never);
          return Response.json(result);
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
        }
      },
      GET: async () => new Response("Use POST", { status: 405 }),
    },
  },
});
