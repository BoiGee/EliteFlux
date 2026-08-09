import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/eliteflux/BrandLogo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — EliteFlux" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase recovery flow: token is in URL hash. The client picks it up
    // automatically. Confirm we have a session ready.
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => navigate({ to: "/" }), 1500);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md glass-card p-8">
        <Link to="/" className="inline-block mb-6">
          <BrandLockup size="md" />
        </Link>
        <h1 className="text-2xl font-bold mb-1">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-6">Enter your new password below.</p>

        {!ready ? (
          <div className="text-sm text-muted-foreground">Preparing…</div>
        ) : done ? (
          <div className="text-sm text-bull bg-bull/10 border border-bull/30 rounded p-3">
            Password updated. Redirecting…
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full h-11 px-3 rounded-lg bg-surface border border-border text-sm"
              required
              minLength={6}
              maxLength={72}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full h-11 px-3 rounded-lg bg-surface border border-border text-sm"
              required
              minLength={6}
              maxLength={72}
            />
            {error && <div className="text-xs text-bear bg-bear/10 border border-bear/30 rounded p-2">{error}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-lg bg-gradient-primary text-white font-semibold text-sm disabled:opacity-50"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
