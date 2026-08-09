import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public rollout state. Returns booleans only — never the invite code itself.

export const getPlatformState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as never;
  const { getFeatureFlags, getSignupMode, DEFAULT_FLAGS } = await import("./platform.server");
  try {
    const [flags, signup] = await Promise.all([getFeatureFlags(admin), getSignupMode(admin)]);
    return { flags, inviteOnly: signup.mode === "invite" };
  } catch {
    return { flags: DEFAULT_FLAGS, inviteOnly: false };
  }
});

export const checkSignupAllowed = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().max(64).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSignupMode } = await import("./platform.server");
    const signup = await getSignupMode(supabaseAdmin as never);
    if (signup.mode !== "invite") return { allowed: true };
    const given = (data.code ?? "").trim();
    if (given && signup.code && given.toLowerCase() === signup.code.trim().toLowerCase()) {
      return { allowed: true };
    }
    return { allowed: false, message: "EliteFlux is invite-only right now. Enter a valid invite code to continue." };
  });
