import { createFileRoute } from "@tanstack/react-router";

// Public cron endpoint — the 1-minute fast-lane alert check (a narrower
// slice of alert trigger types, plus Autopilot's urgent-exit check). The
// actual job body lives in @/lib/jobs.server so the in-process scheduler
// (scheduler.server.ts) can run it without an HTTP round trip. Mirrors
// evaluate-alerts.ts exactly — this route existing at all is what lets the
// owner console's "Run now" button on this job actually do something.
export const Route = createFileRoute("/api/public/evaluate-alerts-fast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runFastAlertsJob } = await import("@/lib/jobs.server");

        try {
          const result = await runFastAlertsJob(supabaseAdmin as never);
          return Response.json(result, { status: "skipped" in result ? 202 : 200 });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
        }
      },

      GET: async () => new Response("Use POST", { status: 405 }),
    },
  },
});
