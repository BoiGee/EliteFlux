// Verifies the bearer token an MCP client presents, the same way every other
// server route in this app does (src/integrations/supabase/auth-middleware.ts)
// — via supabase.auth.getClaims(token), not a hand-rolled JWT/JWKS check.
// Unlike that middleware, this never throws: tools/list must work for an
// unauthenticated client (so it can discover what's here before connecting
// to Supabase's OAuth flow), and individual tools decide for themselves what
// to do with an unauthenticated call — same behavior as before this rewrite.
import { createClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Database } from "@/integrations/supabase/types";

/** userId lives in AuthInfo.extra — the SDK's AuthInfo has no dedicated user-id field of its own. */
export async function verifyBearerToken(request: Request): Promise<AuthInfo | undefined> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return undefined;

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return undefined;

  try {
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) return undefined;

    return {
      token,
      clientId: userId,
      scopes: ["authenticated"],
      extra: { userId },
    };
  } catch {
    return undefined;
  }
}

export function userIdFromAuthInfo(authInfo: AuthInfo | undefined): string | undefined {
  const id = authInfo?.extra?.["userId"];
  return typeof id === "string" ? id : undefined;
}
