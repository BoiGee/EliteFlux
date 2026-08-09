import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformControls, setPlatformControls } from "@/lib/admin.functions";

/**
 * Staged-rollout controls: invite-only sign-up and platform feature switches.
 * The `coach` switch is owner-only (server-enforced in setPlatformControls,
 * not just hidden here) — pass canManageCoach to render it, from the /owner
 * route only. Plain admins never see it, so there's no button that looks
 * clickable but silently fails for them.
 */
export function LaunchControls({ canManageCoach = false }: { canManageCoach?: boolean }) {
  const qc = useQueryClient();
  const get = useServerFn(getPlatformControls);
  const set = useServerFn(setPlatformControls);
  const q = useQuery({ queryKey: ["admin", "controls"], queryFn: () => get() });
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data?.signup) setCode(q.data.signup.code ?? "");
  }, [q.data]);

  const save = async (patch: any) => {
    await set({ data: patch });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    qc.invalidateQueries({ queryKey: ["admin", "controls"] });
  };

  const flags = q.data?.flags;
  const signup = q.data?.signup;
  const switches = (["autopilot", "payments", "coach"] as const).filter((f) => f !== "coach" || canManageCoach);

  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Launch controls</h2>
        {saved && <span className="text-xs text-bull">Saved</span>}
      </div>
      {!q.data ? (
        <p className="text-xs text-muted-foreground">Loading controls…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="text-xs text-muted-foreground mb-2">Who can create an account</div>
            <div className="flex flex-wrap items-center gap-2">
              {(["open", "invite"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => save({ signup: { mode: m, code } })}
                  className={`text-xs px-3 py-1.5 rounded-md border ${
                    signup?.mode === m ? "border-primary text-white" : "border-border text-muted-foreground hover:text-white"
                  }`}
                >
                  {m === "open" ? "Open to everyone" : "Invite code only"}
                </button>
              ))}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Invite code"
                className="h-8 px-3 rounded-md bg-surface border border-border text-xs outline-none focus:border-primary/60"
              />
              <button
                onClick={() => save({ signup: { mode: signup?.mode ?? "open", code } })}
                className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-white"
              >
                Save code
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">Feature switches (apply to everyone)</div>
            <div className="flex flex-wrap gap-2">
              {switches.map((f) => {
                const on = flags?.[f] !== false;
                return (
                  <button
                    key={f}
                    onClick={() => save({ flags: { ...(flags ?? { autopilot: true, payments: true, coach: true }), [f]: !on } })}
                    className={`text-xs px-3 py-1.5 rounded-md border capitalize ${
                      on ? "border-bull/50 text-bull" : "border-bear/50 text-bear"
                    }`}
                  >
                    {f} · {on ? "on" : "off"}
                  </button>
                );
              })}
            </div>
            {!canManageCoach && (
              <p className="text-[10px] text-muted-foreground mt-2">The Coach switch is owner-only.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
