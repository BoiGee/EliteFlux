import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { telegramSignIn } from "@/lib/telegram-auth.functions";
import { BrandLockup } from "@/components/eliteflux/BrandLogo";

export const INVITE_STORAGE_KEY = "eliteflux.tg.invite";

export const Route = createFileRoute("/auth/telegram")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Finishing Telegram sign-in — EliteFlux" },
      { name: "description", content: "Completing your Telegram sign-in to EliteFlux." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Finishing Telegram sign-in — EliteFlux" },
      { property: "og:description", content: "Completing your Telegram sign-in to EliteFlux." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TelegramCallback,
});

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function TelegramCallback() {
  const navigate = useNavigate();
  const signIn = useServerFn(telegramSignIn);
  const [message, setMessage] = useState("Finishing your Telegram sign-in…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get("next"));
    const payload = {
      id: params.get("id") ?? "",
      auth_date: params.get("auth_date") ?? "",
      hash: params.get("hash") ?? "",
      first_name: params.get("first_name") ?? undefined,
      last_name: params.get("last_name") ?? undefined,
      username: params.get("username") ?? undefined,
      photo_url: params.get("photo_url") ?? undefined,
    };

    const fail = (msg: string) => {
      console.error("[telegram-auth] failed:", msg);
      setMessage(msg);
      setTimeout(() => {
        navigate({ to: "/login", search: next === "/" ? {} : { next } });
      }, 2500);
    };

    if (!payload.id || !payload.hash || !payload.auth_date) {
      fail("That Telegram login link is incomplete. Please try signing in again.");
      return;
    }

    const invite = window.sessionStorage.getItem(INVITE_STORAGE_KEY) ?? undefined;
    console.info("[telegram-auth] callback received, verifying…");

    void (async () => {
      try {
        const res = await signIn({ data: { payload: payload as never, inviteCode: invite } });
        console.info("[telegram-auth] server verification ok:", res.ok);
        if (!res.ok) {
          fail(res.message ?? "Telegram sign-in failed.");
          return;
        }
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: res.tokenHash,
        });
        if (error) {
          fail(error.message);
          return;
        }
        const { data } = await supabase.auth.getSession();
        console.info("[telegram-auth] session established:", Boolean(data.session));
        if (!data.session) {
          fail("Signed in, but the session did not start. Please try again.");
          return;
        }
        window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
        setMessage("Signed in. Taking you to your dashboard…");
        window.location.replace(next);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Telegram sign-in failed.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="glass-panel p-8 text-center space-y-4 max-w-sm w-full">
        <div className="flex justify-center">
          <BrandLockup size="lg" />
        </div>
        <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
