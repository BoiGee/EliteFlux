import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTelegramAuthConfig, linkTelegram, unlinkTelegram } from "@/lib/telegram-auth.functions";
import { TelegramLoginButton, type TelegramAuthPayload } from "./TelegramLoginButton";

/** Connect / disconnect Telegram for an already signed-in account. */
export function TelegramLinkCard({
  linked,
  handle,
  onChanged,
}: {
  linked: boolean;
  handle: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const configFn = useServerFn(getTelegramAuthConfig);
  const link = useServerFn(linkTelegram);
  const unlink = useServerFn(unlinkTelegram);
  const config = useQuery({ queryKey: ["telegram", "auth-config"], queryFn: () => configFn(), staleTime: 300_000 });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!config.data?.enabled || !config.data.botUsername) return null;

  const onAuth = async (payload: TelegramAuthPayload) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await link({ data: { payload: payload as never } });
      setMsg(res.ok ? "Telegram connected — alerts can now reach you instantly." : res.message);
      if (res.ok) await onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not connect Telegram.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await unlink({});
      setMsg(res.ok ? "Telegram disconnected." : res.message);
      if (res.ok) await onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not disconnect Telegram.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-3 border-t border-border/50 space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Telegram account</p>
      {linked ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground/80">Connected{handle ? ` as ${handle}` : ""}</span>
          <button
            onClick={disconnect}
            disabled={busy}
            className="h-9 px-4 rounded-lg glass-panel text-xs font-semibold disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Connect Telegram to sign in with one tap and receive alerts instantly.
          </p>
          <TelegramLoginButton botUsername={config.data.botUsername} onAuth={onAuth} />
        </>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
