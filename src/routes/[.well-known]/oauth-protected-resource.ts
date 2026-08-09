import { createFileRoute } from "@tanstack/react-router";

// Hand-written RFC 9728 OAuth Protected Resource Metadata for /mcp.
// `resource` is derived from the request itself (honoring X-Forwarded-Host,
// same as the trustForwardedHost behavior this replaces) so it stays correct
// behind a proxy/CDN without hardcoding a domain.
function resourceUrl(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const protocol = forwardedProto ?? url.protocol.replace(":", "");
  return `${protocol}://${host}/mcp`;
}

function authorizationServer(): string {
  const projectRef = process.env["SUPABASE_PROJECT_ID"] ?? process.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";
  return `https://${projectRef}.supabase.co/auth/v1`;
}

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json({
          resource: resourceUrl(request),
          authorization_servers: [authorizationServer()],
        }),
    },
  },
});
