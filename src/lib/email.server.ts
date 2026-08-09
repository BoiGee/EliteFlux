// Server-only: transactional email via Resend's HTTP API. Replaces the
// `enqueue_email` Postgres RPC, which was Lovable-Cloud-managed infrastructure
// and doesn't exist on a self-hosted Supabase project.
export interface EmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendTransactionalEmail(input: EmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];
  if (!apiKey || !from) return { ok: false, error: "Email sending is not configured yet" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email request failed" };
  }
}
