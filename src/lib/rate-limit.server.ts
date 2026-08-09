// Fixed-window per-user throttle for expensive third-party calls.
// Not a general-purpose rate limiter — it exists to stop one account from
// hammering an upstream provider (e.g. on-chain payment verification).

type Admin = { from: (t: string) => any };

export interface ThrottleResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  admin: Admin,
  userId: string,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<ThrottleResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
  const retryAfterSeconds = Math.ceil((Math.floor(now / windowMs) * windowMs + windowMs - now) / 1000);

  try {
    const { data: row } = await admin
      .from("rate_limits")
      .select("id,count")
      .eq("user_id", userId)
      .eq("bucket", bucket)
      .eq("window_start", windowStart)
      .maybeSingle();

    const used = (row?.count as number | undefined) ?? 0;
    if (used >= limit) return { allowed: false, remaining: 0, retryAfterSeconds };

    if (row) await admin.from("rate_limits").update({ count: used + 1 }).eq("id", row.id);
    else await admin.from("rate_limits").insert({ user_id: userId, bucket, window_start: windowStart, count: 1 });

    return { allowed: true, remaining: Math.max(0, limit - used - 1), retryAfterSeconds };
  } catch {
    // Never block a legitimate action because the counter itself failed.
    return { allowed: true, remaining: limit, retryAfterSeconds };
  }
}
