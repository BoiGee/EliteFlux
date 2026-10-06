import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — the 10-minute token-discovery scan. The actual job
// body lives in @/lib/jobs.server so the in-process scheduler
// (scheduler.server.ts) can run it without an HTTP round trip. Mirrors
// evaluate-alerts.ts/evaluate-alerts-fast.ts exactly — this route existing
// at all is what lets the owner console's "Run now" button on this job
// actually do something.
export const Route = createFileRoute("/api/public/discover-tokens")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDiscoverTokensJob } = await import("@/lib/jobs.server");

        try {
          const result = await runDiscoverTokensJob(supabaseAdmin as never);
          return Response.json(result, { status: "skipped" in result ? 202 : 200 });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
        }
      },

      GET: async () => new Response("Use POST", { status: 405 }),
    },
  },
});
