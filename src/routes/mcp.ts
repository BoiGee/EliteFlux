import { createFileRoute } from "@tanstack/react-router";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "../lib/mcp";
import { verifyBearerToken } from "../lib/mcp/auth";

// Fresh server + transport per request, stateless mode (no sessionIdGenerator) —
// matches the SDK's documented stateless pattern, appropriate here since none
// of these tools need multi-turn session state or server-initiated notifications.
async function handleMcpRequest(request: Request): Promise<Response> {
  const authInfo = await verifyBearerToken(request);
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request, { authInfo });
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: ({ request }) => handleMcpRequest(request),
    },
  },
});
