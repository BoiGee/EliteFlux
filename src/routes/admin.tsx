import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { verifyAdmin } from "@/lib/admin.functions";
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

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin console — EliteFlux" },
      { name: "description", content: "Internal EliteFlux operations console." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [openUser, setOpenUser] = useState<string | null>(null);

  // Authorisation is decided on the server; nothing privileged renders until
  // that verdict comes back.
  const verify = useServerFn(verifyAdmin);
  const gate = useQuery({
    queryKey: ["admin", "gate"],
    queryFn: () => verify(),
    enabled: !loading && !!user,
    retry: false,
  });
  const isAdmin = gate.data?.admin === true;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
    if (gate.isError || (gate.isSuccess && !isAdmin)) navigate({ to: "/" });
  }, [user, loading, gate.isError, gate.isSuccess, isAdmin, navigate]);

  if (loading || gate.isPending || !isAdmin) {
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
            <ShieldCheck className="w-5 h-5 text-primary" /> Admin console
          </h1>
        </div>
      </header>

      <NeedsAttention />
      <MetricsStrip />
      <HealthPanel />
      <AccuracyPanel />
      <CohortPanel />
      <PaymentsPanel onOpenUser={setOpenUser} />
      <UsersPanel onOpenUser={setOpenUser} canManageRoles={false} />
      <LaunchControls canManageCoach={false} />
      <AuditPanel />

      {openUser && <UserDetailDialog userId={openUser} onClose={() => setOpenUser(null)} />}
    </div>
  );
}

