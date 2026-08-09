import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { COACH_DAILY_LIMIT, type CoachLevel } from "@/lib/coach-shared";

type Body = { messages?: unknown; threadId?: unknown };

function err(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

export const Route = createFileRoute("/api/coach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveCaller } = await import("@/lib/tier.server");
        const caller = await resolveCaller(request);
        if (!caller) return err("Sign in to talk to Flux, your AI Coach.", 401);

        const body = (await request.json()) as Body;
        const messages = body.messages;
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        if (!Array.isArray(messages) || !threadId) return err("Missing messages or thread.", 400);

        if (!process.env["ANTHROPIC_API_KEY"]) return err("The coach is not configured yet.", 500);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as unknown as { from: (t: string) => any };

        const { isFeatureEnabled } = await import("@/lib/platform.server");
        if (!(await isFeatureEnabled(admin, "coach"))) {
          return err("Flux the AI Coach is temporarily unavailable.", 503);
        }


        // Thread must belong to the caller.
        const { data: thread } = await admin
          .from("coach_threads")
          .select("id,user_id,title")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread || thread.user_id !== caller.userId) return err("Conversation not found.", 404);

        // Daily allowance.
        const day = new Date().toISOString().slice(0, 10);
        const limit = COACH_DAILY_LIMIT[caller.tier];
        const { data: usage } = await admin
          .from("coach_usage")
          .select("id,messages")
          .eq("user_id", caller.userId)
          .eq("day", day)
          .maybeSingle();
        const used = usage?.messages ?? 0;
        if (used >= limit) {
          return err(
            `You've used all ${limit} Flux messages for today on the ${caller.tier.toUpperCase()} plan. It resets at 00:00 UTC.`,
            429,
            { limit, used, upgradeUrl: "/pricing" },
          );
        }
        if (usage) await admin.from("coach_usage").update({ messages: used + 1 }).eq("id", usage.id);
        else await admin.from("coach_usage").insert({ user_id: caller.userId, day, messages: 1 });

        // Personalisation.
        const [{ data: coachProfile }, { data: profile }, { data: memoryRows }] = await Promise.all([
          admin.from("coach_profile").select("experience_level,goals").eq("user_id", caller.userId).maybeSingle(),
          admin.from("profiles").select("display_name,risk_sensitivity").eq("id", caller.userId).maybeSingle(),
          admin
            .from("coach_memory")
            .select("fact")
            .eq("user_id", caller.userId)
            .order("created_at", { ascending: false })
            .limit(15),
        ]);
        const { data: callRows } = await admin
          .from("coach_calls")
          .select(
            "symbol,stance,source,entry_price,move_pct,score,grade,verdict,status,regime_at_call,flux_at_call,created_at",
          )
          .eq("user_id", caller.userId)
          .order("created_at", { ascending: false })
          .limit(40);

        const { buildCoachSystemPrompt, buildCoachTools, computeBehavior } = await import("@/lib/coach.server");
        const behavior = computeBehavior((callRows ?? []) as never);

        const system = buildCoachSystemPrompt({
          tier: caller.tier,
          level: (coachProfile?.experience_level as CoachLevel) ?? "beginner",
          goals: coachProfile?.goals ?? null,
          riskSensitivity: profile?.risk_sensitivity ?? null,
          behaviorSummary: behavior.summary,
          displayName: profile?.display_name ?? null,
          memories: ((memoryRows ?? []) as { fact: string }[]).map((m) => m.fact),
        });

        const uiMessages = messages as UIMessage[];
        const last = uiMessages[uiMessages.length - 1];

        // Persist the user turn.
        if (last?.role === "user") {
          await admin.from("coach_messages").insert({
            thread_id: threadId,
            user_id: caller.userId,
            client_id: last.id ?? null,
            role: "user",
            parts: last.parts ?? [],
          });
          if (thread.title === "New conversation") {
            const text = (last.parts ?? [])
              .map((p) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .trim();
            if (text) {
              await admin
                .from("coach_threads")
                .update({ title: text.slice(0, 60) })
                .eq("id", threadId);
            }
          }
        }

        // Reasoning depth scales with plan — free gets a fast, competent answer;
        // elite gets the deepest reasoning the model can do for a market call.
        // Elite runs "xhigh" rather than "max": Anthropic's own guidance is
        // that "max" shows diminishing returns and is prone to overthinking
        // for exactly this kind of agentic/tool-calling workload, while xhigh
        // is "the best setting for most coding and agentic use cases" — same
        // depth of answer for meaningfully fewer output tokens, which is what
        // COACH_DAILY_LIMIT.elite is now sized against (see coach-shared.ts).
        const EFFORT_BY_TIER: Record<typeof caller.tier, "medium" | "high" | "xhigh"> = {
          free: "medium",
          pro: "high",
          elite: "xhigh",
        };

        const result = streamText({
          model: anthropic("claude-opus-5"),
          system,
          messages: await convertToModelMessages(uiMessages),
          tools: buildCoachTools({ admin, userId: caller.userId, tier: caller.tier, threadId }),
          stopWhen: stepCountIs(50),
          providerOptions: {
            anthropic: {
              thinking: { type: "adaptive", display: "summarized" },
              effort: EFFORT_BY_TIER[caller.tier],
              // The system prompt + tool schemas (10-17 tools) are re-sent on
              // every model call, including every intermediate step of a
              // single turn's tool-calling loop. Auto-caching that prefix
              // (and the growing message history across turns) cuts that
              // fixed cost to ~10% after the first write of a session.
              cacheControl: { type: "ephemeral" },
            },
          },
          onError: ({ error }) => console.error("coach stream error", error),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          sendReasoning: true,
          onFinish: async ({ responseMessage }) => {
            try {
              await admin.from("coach_messages").insert({
                thread_id: threadId,
                user_id: caller.userId,
                client_id: responseMessage.id ?? null,
                role: "assistant",
                parts: responseMessage.parts ?? [],
              });
              await admin.from("coach_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
              // Strongest "this user is actually using the product" signal we have —
              // feeds the re-engagement nudge job's inactivity detection.
              await admin.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", caller.userId);
            } catch (e) {
              console.error("coach persist error", e);
            }
          },
        });
      },
    },
  },
});
