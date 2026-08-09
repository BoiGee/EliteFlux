import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const payloadSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  auth_date: z.union([z.string(), z.number()]).transform(String),
  hash: z.string().min(1).max(256),
  first_name: z.string().max(200).optional(),
  last_name: z.string().max(200).optional(),
  username: z.string().max(64).optional(),
  photo_url: z.string().url().max(500).optional(),
});

/** Public: is Telegram sign-in available, and under which bot username. */
export const getTelegramAuthConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { telegramBotUsername } = await import("./telegram-auth.server");
  const username = telegramBotUsername();
  const enabled = Boolean(username && process.env["TELEGRAM_BOT_TOKEN"]);
  return { enabled, botUsername: enabled ? username : null };
});

/**
 * Verified Telegram login → EliteFlux session token.
 * Returns a one-time token hash the browser exchanges with verifyOtp.
 */
export const telegramSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ payload: payloadSchema, inviteCode: z.string().max(64).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    const {
      verifyTelegramPayload,
      findUserByTelegramId,
      createTelegramUser,
      attachTelegramProfile,
      mintSessionToken,
      telegramEmail,
    } = await import("./telegram-auth.server");

    const payload = verifyTelegramPayload(data.payload);

    let userId = await findUserByTelegramId(admin, payload.id);
    if (!userId) {
      // First-time Telegram sign-up honours the same rollout gate as email sign-up.
      const { getSignupMode } = await import("./platform.server");
      const signup = await getSignupMode(admin as never);
      if (signup.mode === "invite") {
        const given = (data.inviteCode ?? "").trim();
        const ok = given && signup.code && given.toLowerCase() === signup.code.trim().toLowerCase();
        if (!ok) {
          return {
            ok: false as const,
            needsInvite: true,
            message: "EliteFlux is invite-only right now. Enter a valid invite code to continue.",
          };
        }
      }
      userId = await createTelegramUser(admin, payload);
    }

    await attachTelegramProfile(admin, userId, payload);
    const tokenHash = await mintSessionToken(admin, telegramEmail(payload.id));
    return { ok: true as const, tokenHash };
  });

/** Link Telegram to the currently signed-in account (no new account created). */
export const linkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ payload: payloadSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin;
    const { verifyTelegramPayload, findUserByTelegramId, attachTelegramProfile } = await import(
      "./telegram-auth.server"
    );
    const payload = verifyTelegramPayload(data.payload);
    const existing = await findUserByTelegramId(admin, payload.id);
    if (existing && existing !== context.userId) {
      return { ok: false as const, message: "That Telegram account is already linked to another EliteFlux account." };
    }
    await attachTelegramProfile(admin, context.userId, payload);
    return { ok: true as const, handle: payload.username ? `@${payload.username}` : null };
  });

/** Unlink Telegram from the signed-in account. */
export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    if (prof?.email?.endsWith("@telegram.eliteflux.local")) {
      return {
        ok: false as const,
        message: "Telegram is the only way into this account, so it can't be unlinked.",
      };
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_user_id: null, telegram_chat_id: null })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true as const };
  });
