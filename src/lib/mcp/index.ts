import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMarketIntelligence from "./tools/get-market-intelligence";
import getCoinIntel from "./tools/get-coin-intel";
import getMySubscription from "./tools/get-my-subscription";
import listWatchlist from "./tools/list-watchlist";
import addToWatchlist from "./tools/add-to-watchlist";
import removeFromWatchlist from "./tools/remove-from-watchlist";
import listAlerts from "./tools/list-alerts";
import createAlert from "./tools/create-alert";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "eliteflux-insights",
  title: "EliteFlux Insights",
  version: "0.1.0",
  instructions:
    "Tools for EliteFlux, a crypto market intelligence platform. Use `get_market_intelligence` for the overall ELITE FLUX score, regime, whale and sentiment read, and `get_coin_intel` for per-asset signals. Account tools (subscription, watchlist, alerts) act as the signed-in EliteFlux user. All output is market intelligence, not financial advice.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMarketIntelligence,
    getCoinIntel,
    getMySubscription,
    listWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    listAlerts,
    createAlert,
  ],
});
