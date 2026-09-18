// Server-only alert fan-out. Takes an already-persisted alert_history row and
// pushes it to the user's chosen channels, recording one alert_deliveries row
// per attempt so failures are visible instead of silent.
import type { AlertChannel } from "./tier-matrix";

type Admin = {
  from: (t: string) => any;
};

export interface DeliveryTarget {
  email: string | null;
  telegram_chat_id: string | null;
  webhook_url: string | null;
}

export interface DeliveryInput {
  userId: string;
  alertId: string;
  historyId: string | null;
  channels: AlertChannel[];
  title: string;
  message: string;
  payload: Record<string, unknown>;
}

type Outcome = { status: "sent" | "skipped" | "failed"; error?: string };

async function sendTelegram(chatId: string | null, title: string, message: string): Promise<Outcome> {
  if (!chatId) return { status: "skipped", error: "No Telegram chat ID on profile" };
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) return { status: "skipped", error: "Telegram bot is not connected yet" };
  try {
    // No timeout here previously could hang alert delivery indefinitely,
    // which blocks the whole evaluate-alerts-fast cycle from ever reaching
    // finishRun (deliverFiredAlerts is awaited right before it) — same class
    // of bug as the market-intelligence pipeline's missing fetch timeouts.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: "HTML",
        text: `<b>EliteFlux · ${title}</b>\n${message}`,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const body = await res.text();
    if (!res.ok) return { status: "failed", error: `Telegram ${res.status}: ${body.slice(0, 300)}` };
    try {
      const j = JSON.parse(body) as { ok?: boolean; description?: string };
      if (j.ok === false) return { status: "failed", error: j.description ?? "Telegram rejected the message" };
    } catch {
      /* non-JSON success body is fine */
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Telegram request failed" };
  }
}

async function sendWebhook(url: string | null, input: DeliveryInput): Promise<Outcome> {
  if (!url) return { status: "skipped", error: "No webhook URL on profile" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "failed", error: "Webhook URL is not a valid URL" };
  }
  if (parsed.protocol !== "https:") return { status: "failed", error: "Webhook URL must use https" };

  const body = JSON.stringify({
    source: "eliteflux",
    alert_id: input.alertId,
    history_id: input.historyId,
    title: input.title,
    message: input.message,
    payload: input.payload,
    fired_at: new Date().toISOString(),
  });

  const secret = process.env["ALERT_WEBHOOK_SECRET"];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    headers["X-EliteFlux-Signature"] = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(parsed.toString(), {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { status: "failed", error: `Endpoint responded ${res.status}` };
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Webhook request failed" };
  }
}

async function sendEmail(target: DeliveryTarget, title: string, message: string): Promise<Outcome> {
  if (!target.email) return { status: "skipped", error: "No email on profile" };
  const { sendTransactionalEmail } = await import("./email.server");
  const appUrl = process.env["APP_URL"] ?? "https://elite-flux.com";
  const result = await sendTransactionalEmail({
    to: target.email,
    subject: `EliteFlux alert — ${title}`,
    html: `<h2>${title}</h2><p>${message}</p><p><a href="${appUrl}/alerts">Open EliteFlux</a></p>`,
  });
  return result.ok ? { status: "sent" } : { status: "skipped", error: result.error };
}

/** Fan an alert out to every requested channel and log each attempt. */
export async function deliverAlert(admin: Admin, input: DeliveryInput): Promise<void> {
  const extra = input.channels.filter((c) => c !== "in_app");

  const rows: Array<{ channel: AlertChannel } & Outcome> = [{ channel: "in_app", status: "sent" }];

  if (extra.length) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email,telegram_chat_id,webhook_url")
      .eq("id", input.userId)
      .maybeSingle();
    const target: DeliveryTarget = {
      email: profile?.email ?? null,
      telegram_chat_id: profile?.telegram_chat_id ?? null,
      webhook_url: profile?.webhook_url ?? null,
    };

    for (const channel of extra) {
      let outcome: Outcome;
      if (channel === "telegram") outcome = await sendTelegram(target.telegram_chat_id, input.title, input.message);
      else if (channel === "webhook") outcome = await sendWebhook(target.webhook_url, input);
      else if (channel === "email") outcome = await sendEmail(target, input.title, input.message);
      else outcome = { status: "skipped", error: "Unknown channel" };
      rows.push({ channel, ...outcome });
    }
  }

  await admin.from("alert_deliveries").insert(
    rows.map((r) => ({
      user_id: input.userId,
      alert_id: input.alertId,
      history_id: input.historyId,
      channel: r.channel,
      status: r.status,
      error: r.error ?? null,
    })),
  );
}

export interface FiredAlertItem {
  userId: string;
  alertId: string;
  historyId: string | null;
  channels: AlertChannel[];
  title: string;
  message: string;
  payload: Record<string, unknown>;
}

// A single BTC move can trip a dozen correlated alt alerts for one user in the
// same cycle — nobody wants a dozen separate pushes for one market event.
const CLUSTER_THRESHOLD = 3;
const CLUSTER_PREVIEW_LINES = 8;

/**
 * Delivers a batch of fired alerts, bundling any one user's alerts from this
 * cycle into a single notification once they get spammy. Below the threshold,
 * behavior is identical to calling deliverAlert once per item.
 */
export async function deliverFiredAlerts(admin: Admin, items: FiredAlertItem[]): Promise<{ errors: number }> {
  let errors = 0;
  const byUser = new Map<string, FiredAlertItem[]>();
  for (const it of items) {
    (byUser.get(it.userId) ?? byUser.set(it.userId, []).get(it.userId)!).push(it);
  }

  for (const [userId, userItems] of byUser) {
    if (userItems.length < CLUSTER_THRESHOLD) {
      for (const it of userItems) {
        try {
          await deliverAlert(admin, {
            userId,
            alertId: it.alertId,
            historyId: it.historyId,
            channels: it.channels,
            title: it.title,
            message: it.message,
            payload: it.payload,
          });
        } catch {
          errors++;
        }
      }
      continue;
    }

    const channelSet = new Set<AlertChannel>();
    userItems.forEach((it) => it.channels.forEach((c) => channelSet.add(c)));
    const lines = userItems.slice(0, CLUSTER_PREVIEW_LINES).map((it) => `• ${it.title}: ${it.message}`);
    const more = userItems.length > CLUSTER_PREVIEW_LINES ? `\n…and ${userItems.length - CLUSTER_PREVIEW_LINES} more.` : "";

    try {
      await deliverAlert(admin, {
        userId,
        alertId: userItems[0]!.alertId,
        historyId: userItems[0]!.historyId,
        channels: [...channelSet],
        title: `${userItems.length} alerts fired`,
        message: `${lines.join("\n")}${more}`,
        payload: { bundled: true, count: userItems.length, alertIds: userItems.map((it) => it.alertId) },
      });
    } catch {
      errors++;
    }
  }

  return { errors };
}
