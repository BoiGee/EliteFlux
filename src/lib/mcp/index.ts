import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolContext, AnyToolDefinition } from "./protocol";
import { userIdFromAuthInfo } from "./auth";
import getMarketIntelligence from "./tools/get-market-intelligence";
import getCoinIntel from "./tools/get-coin-intel";
import getMySubscription from "./tools/get-my-subscription";
import listWatchlist from "./tools/list-watchlist";
import addToWatchlist from "./tools/add-to-watchlist";
import removeFromWatchlist from "./tools/remove-from-watchlist";
import listAlerts from "./tools/list-alerts";
import createAlert from "./tools/create-alert";

const TOOLS: AnyToolDefinition[] = [
  getMarketIntelligence,
  getCoinIntel,
  getMySubscription,
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  listAlerts,
  createAlert,
];

function toolContextFor(authInfo: AuthInfo | undefined): ToolContext {
  const userId = userIdFromAuthInfo(authInfo);
  return {
    isAuthenticated: () => !!userId,
    getUserId: () => userId,
    getToken: () => authInfo?.token,
  };
}

/** Builds a fresh server instance — one per request, per the SDK's stateless-mode pattern. */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "eliteflux-insights", title: "EliteFlux Insights", version: "0.1.0" },
    {
      instructions:
        "Tools for EliteFlux, a crypto market intelligence platform. Use `get_market_intelligence` for the overall ELITE FLUX score, regime, whale and sentiment read, and `get_coin_intel` for per-asset signals. Account tools (subscription, watchlist, alerts) act as the signed-in EliteFlux user. All output is market intelligence, not financial advice.",
    },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>, extra: { authInfo?: AuthInfo }) =>
        tool.handler(args, toolContextFor(extra.authInfo)),
    );
  }

  return server;
}
