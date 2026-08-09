import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — prunes the global tables that grow unbounded
// (market snapshots, resolved signal events, signal outcomes, volatility and
// stablecoin supply history) with real safety margin over every lookback
// window any engine actually reads. The job body lives in @/lib/jobs.server
// so the in-process scheduler can run it without an HTTP round trip.
export const Route = createFileRoute("/api/public/retention-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runRetentionCleanupJob } = await import("@/lib/jobs.server");

        try {
          const result = await runRetentionCleanupJob(supabaseAdmin as never);
          return Response.json(result, { status: "skipped" in result ? 202 : 200 });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
        }
      },

      GET: async () => new Response("Use POST", { status: 405 }),
    },
  },
});
