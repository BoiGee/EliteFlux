import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ThumbsDown, ThumbsUp, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCoachThread, submitFeedback } from "@/lib/coach.functions";
import { COACH_STARTERS } from "@/lib/coach-shared";
import { consumeCoachPrefill } from "@/lib/coach-prefill";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import coachMark from "@/assets/coach-mark.png";

type PersistedRow = { id: string; role: string; parts: unknown };

function toUiMessages(rows: PersistedRow[]): UIMessage[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      parts: (Array.isArray(r.parts) ? r.parts : []) as UIMessage["parts"],
    }));
}

/** Must render inside <PromptInput> — that's what provides the attachments context. */
function AttachmentPreview() {
  const attachments = usePromptInputAttachments();
  if (!attachments.files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
      {attachments.files.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1 text-[11px] bg-surface-2 rounded-md px-2 py-1">
          {f.mediaType?.startsWith("image") ? (
            <img src={f.url} alt={f.filename ?? "attachment"} className="w-4 h-4 rounded object-cover" />
          ) : null}
          <span className="max-w-[120px] truncate">{f.filename ?? "attachment"}</span>
          <button
            type="button"
            onClick={() => attachments.remove(f.id)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function CoachChat({ threadId, className = "" }: { threadId: string; className?: string }) {
  const load = useServerFn(getCoachThread);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const history = useQuery({
    queryKey: ["coach-thread", threadId],
    queryFn: () => load({ data: { threadId } }),
    staleTime: Infinity,
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/coach",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          return {
            body: { ...body, messages, threadId },
            headers: (data.session?.access_token
              ? { Authorization: `Bearer ${data.session.access_token}` }
              : {}) as Record<string, string>,
          };
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, setMessages, error, stop } = useChat({
    id: threadId,
    transport,
    onError: (e) => toast.error(e.message || "The coach could not respond."),
  });

  useEffect(() => {
    if (history.data?.messages) setMessages(toUiMessages(history.data.messages as PersistedRow[]));
  }, [history.data, setMessages]);

  useEffect(() => {
    if (status === "ready") inputRef.current?.focus();
  }, [status, threadId]);

  const busy = status === "submitted" || status === "streaming";

  const feedback = useServerFn(submitFeedback);
  const feedbackM = useMutation({
    mutationFn: (vars: { subjectId: string; rating: "up" | "down" }) =>
      feedback({ data: { subjectType: "coach_message" as const, subjectId: vars.subjectId, rating: vars.rating } }),
    onError: () => toast.error("Couldn't save feedback."),
  });
  const [ratedMessages, setRatedMessages] = useState<Record<string, "up" | "down">>({});
  const rate = (messageId: string, rating: "up" | "down") => {
    setRatedMessages((prev) => ({ ...prev, [messageId]: rating }));
    feedbackM.mutate({ subjectId: messageId, rating });
  };

  const send = (text: string, files?: import("ai").FileUIPart[]) => {
    if ((!text.trim() && !files?.length) || busy) return;
    void sendMessage({ text: text.trim(), files });
  };

  // A question stashed elsewhere in the app (e.g. "what does this mean?") asks itself once.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !history.data || status !== "ready") return;
    prefilled.current = true;
    const q = consumeCoachPrefill();
    if (q) void sendMessage({ text: q });
  }, [history.data, status, sendMessage]);


  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="gap-4">
          {messages.length === 0 && (
            <div className="py-8 text-center">
              <img src={coachMark} alt="Flux the AI Coach" className="w-14 h-14 mx-auto rounded-xl" />
              <p className="mt-3 text-sm font-extrabold">Flux, your AI Coach</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                Ask about the market, your watchlist or your own calls. Answers use the live EliteFlux read and adapt to
                your plan and experience level.
              </p>
              <div className="mt-4 grid gap-1.5 max-w-sm mx-auto">
                {COACH_STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2 rounded-lg glass-panel hover:border-primary/40 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return m.role === "assistant" ? (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
                    ) : (
                      <span key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </span>
                    );
                  }
                  if (part.type === "file" && part.mediaType?.startsWith("image")) {
                    return (
                      <img
                        key={i}
                        src={part.url}
                        alt={part.filename ?? "attachment"}
                        className="max-w-[220px] rounded-lg border border-border mt-1"
                      />
                    );
                  }
                  if (part.type === "reasoning" && part.text?.trim()) {
                    return (
                      <details key={i} className="text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer select-none">Coach reasoning</summary>
                        <p className="mt-1 whitespace-pre-wrap opacity-80">{part.text}</p>
                      </details>
                    );
                  }
                  if (part.type?.startsWith("tool-")) {
                    const p = part as unknown as {
                      type: string;
                      state: "input-streaming" | "input-available" | "output-available" | "output-error";
                      input?: unknown;
                      output?: unknown;
                      errorText?: string;
                    };
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader type={p.type as `tool-${string}`} state={p.state} />
                        <ToolContent>
                          <ToolInput input={p.input} />
                          <ToolOutput output={p.output} errorText={p.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}

                {m.role === "assistant" && !busy && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      onClick={() =>
                        send(
                          "Explain that again in the simplest possible way — like I'm five. One idea per sentence, no jargon at all, and end with what it means for me.",
                        )
                      }
                      className="text-[11px] px-2 py-1 rounded-md bg-surface-2/60 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
                    >
                      Explain simpler
                    </button>
                    <button
                      onClick={() => send("So should I be trading right now, or standing down? Give me the verdict first.")}
                      className="text-[11px] px-2 py-1 rounded-md bg-surface-2/60 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
                    >
                      Trade or stand down?
                    </button>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => rate(m.id, "up")}
                        aria-label="Helpful"
                        className={`p-1 rounded-md hover:bg-surface-2 transition ${
                          ratedMessages[m.id] === "up" ? "text-bull" : "text-muted-foreground/60"
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => rate(m.id, "down")}
                        aria-label="Not helpful"
                        className={`p-1 rounded-md hover:bg-surface-2 transition ${
                          ratedMessages[m.id] === "down" ? "text-bear" : "text-muted-foreground/60"
                        }`}
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                )}
              </MessageContent>
            </Message>
          ))}


          {status === "submitted" && <Shimmer className="text-sm">Reading the live market…</Shimmer>}
          {error && <p className="text-xs text-bear">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        className="mt-3"
        onSubmit={(msg, e) => {
          e.preventDefault();
          const text = msg.text ?? "";
          send(text, msg.files);
          (e.target as HTMLFormElement).reset();
        }}
      >
        <AttachmentPreview />
        <PromptInputTextarea ref={inputRef} placeholder="Ask Flux anything about the market, or attach a chart…" />
        <PromptInputFooter className="justify-between">
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Attach a chart screenshot" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="h-8 px-3 rounded-lg bg-surface-2 hover:bg-surface-2/80 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <XIcon className="w-3.5 h-3.5" /> Stop
            </button>
          ) : (
            <PromptInputSubmit status={status} disabled={busy} />
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
