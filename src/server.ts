import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { startScheduler } from "./lib/scheduler.server";

// Cloudflare Workers sets this; Node/Bun does not. setInterval-based
// scheduling only works on a persistent process — on Workers, background
// jobs instead run via Cloudflare Cron Triggers, wired through the
// "cloudflare:scheduled" Nitro hook (see lib/nitro-scheduled.server.ts) —
// NOT a `scheduled` export on this default object. The nitro "cloudflare-
// module" preset's own generated Worker entry defines `scheduled` itself
// unconditionally and only ever fires that hook; a `scheduled` method
// exported from here is never reached by Cloudflare's dispatch at all. (It
// was defined here for over a month before that was discovered — every Cron
// Trigger fired, Cloudflare reported "Ok", and nothing downstream ever ran:
// no job, no error, no log. Don't re-add it here.)
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
};
