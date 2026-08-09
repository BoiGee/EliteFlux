import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Tier = "free" | "pro" | "elite";

interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  risk_sensitivity: "low" | "medium" | "high";
  telegram_handle: string | null;
  telegram_chat_id: string | null;
  telegram_user_id: string | null;
  webhook_url: string | null;
  onboarded_at: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  tier: Tier;
  profile: Profile | null;
  isAdmin: boolean;
  isOwner: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const loadUserData = async (userId: string) => {
    const [{ data: prof }, { data: sub }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("subscriptions").select("tier,status").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((prof as Profile | null) ?? null);
    const activeTier = sub && (sub.status === "active" || sub.status === "trialing") ? (sub.tier as Tier) : "free";
    setTier(activeTier);
    // Owner is held in addition to admin, not instead of it — check both so
    // the UI can tell them apart instead of showing every owner as a plain admin.
    setIsAdmin(!!roles?.some((r) => r.role === "admin"));
    setIsOwner(!!roles?.some((r) => r.role === "owner"));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // defer to avoid deadlock
        setTimeout(() => loadUserData(s.user.id), 0);
      } else {
        setProfile(null);
        setTier("free");
        setIsAdmin(false);
        setIsOwner(false);
      }
      qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadUserData(data.session.user.id);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [qc]);

  const refresh = async () => {
    if (session?.user) await loadUserData(session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, tier, profile, isAdmin, isOwner, loading, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

// Tier access matrix lives in tier-matrix.ts so the server-side gate
// (src/lib/tier.server.ts) and the UI share exactly one definition.
export { canAccess, requiredTierFor, meetsTier, TIER_ACCESS } from "./tier-matrix";

