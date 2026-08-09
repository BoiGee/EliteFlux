// Server-only Telegram Login verification + account bridging.
// Telegram signs the login payload with HMAC-SHA256 using SHA256(bot_token)
// as the key. Anything that fails verification is rejected outright.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramPayload {
  id: string;
  auth_date: string;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

const MAX_AGE_SECONDS = 300;

export function telegramBotUsername(): string | null {
  const raw = process.env["TELEGRAM_BOT_USERNAME"]?.trim();
  if (!raw) return null;
  return raw.replace(/^@/, "");
}

function botToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  if (!token) throw new Error("Telegram sign-in is not configured yet.");
  return token;
}

/** Throws when the payload is not a fresh, authentic Telegram login. */
export function verifyTelegramPayload(payload: TelegramPayload): TelegramPayload {
  const { hash, ...rest } = payload;
  if (!hash || !payload.id || !payload.auth_date) {
    throw new Error("Incomplete Telegram login payload.");
  }

  const dataCheckString = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()
    .join("\n");

  const secret = createHash("sha256").update(botToken()).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Telegram login could not be verified.");
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate) || Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SECONDS) {
    throw new Error("This Telegram login expired. Please try again.");
  }
  return payload;
}

export function telegramEmail(telegramId: string): string {
  return `tg-${telegramId}@telegram.eliteflux.local`;
}

export function telegramDisplayName(p: TelegramPayload): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.username || `Telegram ${p.id}`;
}

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

/** Existing EliteFlux user id for this Telegram identity, if any. */
export async function findUserByTelegramId(admin: Admin, telegramId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("telegram_user_id", telegramId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Creates the auth user for a Telegram-only account and returns its id. */
export async function createTelegramUser(admin: Admin, p: TelegramPayload): Promise<string> {
  const email = telegramEmail(p.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      display_name: telegramDisplayName(p),
      telegram_username: p.username ?? null,
      avatar_url: p.photo_url ?? null,
      provider: "telegram",
    },
  });
  if (error || !data.user) throw error ?? new Error("Could not create the account.");
  return data.user.id;
}

/** Writes the Telegram identity onto the profile (also enables Telegram alerts). */
export async function attachTelegramProfile(admin: Admin, userId: string, p: TelegramPayload) {
  const { error } = await admin
    .from("profiles")
    .update({
      telegram_user_id: p.id,
      telegram_chat_id: p.id,
      telegram_handle: p.username ? `@${p.username}` : null,
      avatar_url: p.photo_url ?? null,
    })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Mints a one-time magic-link token hash the browser exchanges for a real
 * session via supabase.auth.verifyOtp — no tokens in URLs, no service key
 * anywhere near the client.
 */
export async function mintSessionToken(admin: Admin, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw error ?? new Error("Could not start the session.");
  }
  return data.properties.hashed_token;
}
