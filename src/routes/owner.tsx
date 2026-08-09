import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { verifyOwner } from "@/lib/admin.functions";
import { NeedsAttention } from "@/components/eliteflux/admin/NeedsAttention";
import { MetricsStrip } from "@/components/eliteflux/admin/MetricsStrip";
import { HealthPanel } from "@/components/eliteflux/admin/HealthPanel";
import { PaymentsPanel } from "@/components/eliteflux/admin/PaymentsPanel";
import { UsersPanel } from "@/components/eliteflux/admin/UsersPanel";
import { AuditPanel } from "@/components/eliteflux/admin/AuditPanel";
import { AccuracyPanel } from "@/components/eliteflux/admin/AccuracyPanel";
import { CohortPanel } from "@/components/eliteflux/admin/CohortPanel";
import { UserDetailDialog } from "@/components/eliteflux/admin/UserDetailDialog";
import { LaunchControls } from "@/components/eliteflux/admin/LaunchControls";

// Everything the admin console has, plus owner-only controls (the Coach
// feature switch, and the role management already tucked into the Users
// panel's "Make admin" / "Revoke admin" action, which was already
// server-side owner-gated in setAdminRole — this page just puts that in a
// place other admins never see it, instead of it appearing as a button
// that looks clickable but fails for them).
export const Route = createFileRoute("/owner")({
  head: () => ({
    meta: [
      { title: "Owner console — EliteFlux" },
      { name: "description", content: "Internal EliteFlux owner controls." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OwnerPage,
});

function OwnerPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [openUser, setOpenUser] = useState<string | null>(null);

  // Authorisation is decided on the server; nothing privileged renders until
  // that verdict comes back.
  const verify = useServerFn(verifyOwner);
  const gate = useQuery({
    queryKey: ["owner", "gate"],
    queryFn: () => verify(),
    enabled: !loading && !!user,
    retry: false,
  });
  const isOwner = gate.data?.owner === true;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
    // Fall back to the regular admin console for admins who aren't owners,
    // rather than dead-ending at the dashboard.
    if (gate.isError || (gate.isSuccess && !isOwner)) navigate({ to: isAdmin ? "/admin" : "/" });
  }, [user, loading, gate.isError, gate.isSuccess, isOwner, isAdmin, navigate]);

  if (loading || gate.isPending || !isOwner) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Checking your access…
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground" aria-label="Back to dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" /> Owner console
          </h1>
        </div>
      </header>

      <NeedsAttention />
      <MetricsStrip />
      <HealthPanel />
      <AccuracyPanel />
      <CohortPanel />
      <PaymentsPanel onOpenUser={setOpenUser} />
      <UsersPanel onOpenUser={setOpenUser} canManageRoles={true} />
      <LaunchControls canManageCoach={true} />
      <AuditPanel />

      {openUser && <UserDetailDialog userId={openUser} onClose={() => setOpenUser(null)} />}
    </div>
  );
}
