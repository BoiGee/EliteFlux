// Platform-wide launch controls: staged sign-up gating, feature switches and
// operator notification when a background job keeps failing. All reads go
// through the service client, so callers must already be trusted or public
// (the values here are non-sensitive rollout state).

type Admin = { from: (t: string) => any };

export interface FeatureFlags {
  autopilot: boolean;
  payments: boolean;
  coach: boolean;
}

export interface SignupMode {
  mode: "open" | "invite";
  code: string;
}

export const DEFAULT_FLAGS: FeatureFlags = { autopilot: true, payments: true, coach: true };
export const DEFAULT_SIGNUP: SignupMode = { mode: "open", code: "" };

async function readSetting<T>(admin: Admin, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const value = (data as { value: unknown } | null)?.value;
  if (!value || typeof value !== "object") return fallback;
  return { ...fallback, ...(value as object) } as T;
}

export function getFeatureFlags(admin: Admin): Promise<FeatureFlags> {
  return readSetting<FeatureFlags>(admin, "feature_flags", DEFAULT_FLAGS);
}

export function getSignupMode(admin: Admin): Promise<SignupMode> {
  return readSetting<SignupMode>(admin, "signup_mode", DEFAULT_SIGNUP);
}

export async function writeSetting(admin: Admin, key: string, value: unknown): Promise<void> {
  const { error } = await admin
    .from("platform_settings")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) throw new Error(error.message);
}

/** True when a feature is switched on for everyone. Fails open on read errors. */
export async function isFeatureEnabled(admin: Admin, feature: keyof FeatureFlags): Promise<boolean> {
  try {
    const flags = await getFeatureFlags(admin);
    return flags[feature] !== false;
  } catch {
    return true;
  }
}

/**
 * Email every admin when a background job fails repeatedly. Deduplicated by
 * only firing when the *previous* run of the same job also ended badly, so a
 * single transient upstream blip stays quiet.
 */
export async function notifyOperatorsOfFailure(
  admin: Admin,
  job: string,
  detail: unknown,
): Promise<void> {
  try {
    const { data: recent } = await admin
      .from("system_runs")
      .select("status")
      .eq("job", job)
      .in("status", ["ok", "failed", "stale"])
      .order("started_at", { ascending: false })
      .limit(2);
    const rows = (recent ?? []) as Array<{ status: string }>;
    // rows[0] is the run we just closed; require the one before it to be bad too.
    if (rows.length < 2 || rows[1]!.status === "ok") return;

    const { data: adminRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const ids = ((adminRoles ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    if (!ids.length) return;

    const { data: profiles } = await admin.from("profiles").select("email").in("id", ids);
    const emails = ((profiles ?? []) as Array<{ email: string | null }>)
      .map((p) => p.email)
      .filter((e): e is string => !!e);

    const summary = typeof detail === "string" ? detail : JSON.stringify(detail ?? {}).slice(0, 800);
    console.error(`[eliteflux] job "${job}" failed twice in a row`, summary);

    const { sendTransactionalEmail } = await import("./email.server");
    const appUrl = process.env["APP_URL"] ?? "https://elitefluxx.lovable.app";
    for (const to of emails) {
      await sendTransactionalEmail({
        to,
        subject: `EliteFlux ops — "${job}" failed twice in a row`,
        html: `<h2>Background job degraded</h2><p>The <b>${job}</b> job has failed on its last two runs.</p><pre>${summary}</pre><p><a href="${appUrl}/admin">Open the admin console</a></p>`,
      });
    }
  } catch {
    /* notification must never break the run itself */
  }
}
