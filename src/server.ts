import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { runScheduledTick, startScheduler } from "./lib/scheduler.server";

// Cloudflare Workers sets this; Node/Bun does not. setInterval-based
// scheduling only works on a persistent process — on Workers, background
// jobs run via the `scheduled` handler below (Cron Triggers) instead.
const isCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

if (!isCloudflareWorkers) {
  startScheduler();
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
  async scheduled(controller: { cron: string }) {
    // TEMPORARY diagnostic — proves the scheduled handler itself is reached
    // before anything downstream (job lookup, Supabase client, job body) can
    // swallow evidence of what's happening. Revert once the cause is found.
    console.log(`[scheduled] invoked for cron=${controller.cron}`);
    try {
      await runScheduledTick(controller.cron);
      console.log(`[scheduled] runScheduledTick completed for cron=${controller.cron}`);
    } catch (e) {
      console.error(`[scheduled] runScheduledTick threw for cron=${controller.cron}`, e);
      throw e;
    }
  },
};
