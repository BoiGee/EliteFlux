import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPlatformState, checkSignupAllowed } from "@/lib/platform.functions";
import { getTelegramAuthConfig } from "@/lib/telegram-auth.functions";
import { TelegramLoginButton } from "@/components/eliteflux/TelegramLoginButton";
import { INVITE_STORAGE_KEY } from "@/routes/auth/telegram";
import { BrandLockup } from "@/components/eliteflux/BrandLogo";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — EliteFlux" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
      ? { next: s.next }
      : {},
  component: LoginPage,
});

/** Same-origin relative path to return to after auth (e.g. the OAuth consent page). */
function useNextPath() {
  const { next } = Route.useSearch();
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [invite, setInvite] = useState("");

  // Staged rollout: the platform can be switched to invite-only at any time.
  const platform = useServerFn(getPlatformState);
  const checkInvite = useServerFn(checkSignupAllowed);
  const state = useQuery({ queryKey: ["platform", "state"], queryFn: () => platform(), staleTime: 60_000 });
  const inviteOnly = state.data?.inviteOnly === true;

  const nextPath = useNextPath();

  // Telegram sign-in / sign-up (only rendered when the bot is configured).
  // Uses Telegram's redirect flow: the widget returns to /auth/telegram, which
  // verifies the signed payload server-side and exchanges it for a session.
  const tgConfigFn = useServerFn(getTelegramAuthConfig);
  const tgConfig = useQuery({ queryKey: ["telegram", "auth-config"], queryFn: () => tgConfigFn(), staleTime: 300_000 });
  const [tgAuthUrl, setTgAuthUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL("/auth/telegram", window.location.origin);
    if (nextPath && nextPath !== "/") url.searchParams.set("next", nextPath);
    setTgAuthUrl(url.toString());
  }, [nextPath]);

  // The invite code can't ride along through Telegram, so stash it for the return trip.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (invite.trim()) window.sessionStorage.setItem(INVITE_STORAGE_KEY, invite.trim());
    else window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
  }, [invite]);




  useEffect(() => {
    if (user) window.location.replace(nextPath);
  }, [user, nextPath]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "forgot") {
      const ok = z.string().email().max(255).safeParse(email);
      if (!ok.success) { setError("Enter a valid email."); return; }
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(false);
      if (error) setError(error.message);
      else setInfo("Password reset link sent. Check your inbox.");
      return;
    }
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const gate = await checkInvite({ data: { code: invite } });
        if (!gate.allowed) throw new Error(gate.message ?? "Sign-ups are closed right now.");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${nextPath}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        setInfo("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.replace(nextPath);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${nextPath}` },
    });
    if (error) setError(error.message ?? "Google sign-in failed");
  };


  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md glass-card p-8">
        <Link to="/" className="inline-block mb-6">
          <BrandLockup size="md" />
        </Link>
        <h1 className="text-2xl font-bold mb-1">
          {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "signin" ? "Sign in to access your intelligence dashboard." : mode === "signup" ? "Start with the free plan — upgrade any time." : "Enter your email and we'll send a reset link."}
        </p>

        <button
          type="button"
          onClick={google}
          className="w-full h-11 rounded-lg border border-border bg-surface hover:bg-surface-2 transition text-sm font-medium mb-4"
        >
          Continue with Google
        </button>

        {tgConfig.data?.enabled && tgConfig.data.botUsername && tgAuthUrl && (
          <div className="mb-4">
            {mode === "signup" && inviteOnly && (
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="Invite code (required for Telegram sign-up)"
                className="w-full h-11 px-3 mb-2 rounded-lg bg-surface border border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
              />
            )}
            <TelegramLoginButton botUsername={tgConfig.data.botUsername} authUrl={tgAuthUrl} />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Signing in with Telegram also switches on instant Telegram alerts.
            </p>
          </div>
        )}



        <div className="flex items-center gap-3 my-4 text-[11px] uppercase tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name (optional)"
              className="w-full h-11 px-3 rounded-lg bg-surface border border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
          )}
          {mode === "signup" && inviteOnly && (
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="Invite code"
              required
              className="w-full h-11 px-3 rounded-lg bg-surface border border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full h-11 px-3 rounded-lg bg-surface border border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
          />
          {mode !== "forgot" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              required
              className="w-full h-11 px-3 rounded-lg bg-surface border border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
          )}
          {error && <div className="text-xs text-bear bg-bear/10 border border-bear/30 rounded p-2">{error}</div>}
          {info && <div className="text-xs text-bull bg-bull/10 border border-bull/30 rounded p-2">{info}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-lg bg-gradient-primary text-white font-semibold text-sm disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>
        </form>

        <div className="mt-5 flex flex-col gap-2 text-center text-xs text-muted-foreground">
          {mode === "signin" && (
            <button onClick={() => { setMode("forgot"); setError(null); setInfo(null); }} className="text-primary hover:underline">
              Forgot password?
            </button>
          )}
          {mode === "signin" ? (
            <div>No account?{" "}
              <button onClick={() => setMode("signup")} className="text-primary hover:underline">Sign up</button>
            </div>
          ) : (
            <div>{mode === "forgot" ? "Remembered it?" : "Already have one?"}{" "}
              <button onClick={() => setMode("signin")} className="text-primary hover:underline">Sign in</button>
            </div>
          )}
          <div className="mt-3 text-[10px] text-muted-foreground/70">
            By continuing you agree to our{" "}
            <a href="/terms" className="hover:text-foreground">Terms</a> and{" "}
            <a href="/privacy" className="hover:text-foreground">Privacy</a>.
          </div>
        </div>

      </div>
    </div>
  );
}
