import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { listAdminUsers, setUserPlan, setAdminRole } from "@/lib/admin.functions";
import { Section, SectionState } from "./Section";

export function UsersPanel({
  onOpenUser,
  canManageRoles = false,
}: {
  onOpenUser: (userId: string) => void;
  /** Owner-only, mirrors the server-side gate in setAdminRole — hidden rather
   * than shown-disabled so plain admins never see a button that just fails. */
  canManageRoles?: boolean;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listAdminUsers);
  const plan = useServerFn(setUserPlan);
  const role = useServerFn(setAdminRole);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(25);

  const q = useQuery({
    queryKey: ["admin", "users", search, limit],
    queryFn: () => list({ data: { search: search || undefined, limit } }),
  });

  const planM = useMutation({
    mutationFn: (vars: { userId: string; tier?: any; status?: any; extendDays?: number }) => plan({ data: vars }),
    onSuccess: (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleM = useMutation({
    mutationFn: (vars: { userId: string; admin: boolean }) => role({ data: vars }),
    onSuccess: (r) => {
      r.ok ? toast.success(r.message) : toast.error(r.message);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data?.rows ?? [];

  return (
    <Section
      title="Users, plans & roles"
      icon={<Users className="w-4 h-4 text-primary" />}
      action={
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          className="h-8 px-3 rounded-md bg-surface border border-border text-xs outline-none focus:border-primary/60 w-52"
        />
      }
    >
      <SectionState
        isLoading={q.isPending}
        isError={q.isError}
        isEmpty={!rows.length}
        emptyText="No users match that search."
        onRetry={() => q.refetch()}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">User</th>
                <th className="pr-3">Joined</th>
                <th className="pr-3">Plan</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Renews / ends</th>
                <th className="pr-3">Admin</th>
                <th>Quick actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u: any) => (
                <tr key={u.id} className="border-t border-border/40">
                  <td className="py-2 pr-3">
                    <button onClick={() => onOpenUser(u.id)} className="text-primary hover:underline">
                      {u.email ?? u.display_name ?? u.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="pr-3">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="pr-3">
                    <select
                      value={u.tier}
                      onChange={(e) => planM.mutate({ userId: u.id, tier: e.target.value })}
                      className="bg-surface border border-border/60 rounded px-2 py-1"
                    >
                      <option value="free">free</option>
                      <option value="pro">pro</option>
                      <option value="elite">elite</option>
                    </select>
                  </td>
                  <td className="pr-3">{u.subStatus ?? "—"}</td>
                  <td className="pr-3">{u.periodEnd ? new Date(u.periodEnd).toLocaleDateString() : "—"}</td>
                  <td className="pr-3">{u.isAdmin ? <span className="text-bull">yes</span> : "no"}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => planM.mutate({ userId: u.id, extendDays: 30 })}
                      className="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30"
                    >
                      +30d
                    </button>
                    <button
                      onClick={() => planM.mutate({ userId: u.id, extendDays: 365 })}
                      className="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30"
                    >
                      +1y
                    </button>
                    {canManageRoles && (
                      <button
                        onClick={() => {
                          const next = !u.isAdmin;
                          if (
                            !confirm(
                              next
                                ? `Give ${u.email ?? "this user"} full admin access?`
                                : `Remove admin access from ${u.email ?? "this user"}?`,
                            )
                          )
                            return;
                          roleM.mutate({ userId: u.id, admin: next });
                        }}
                        className="px-2 py-1 rounded bg-surface border border-border/60 hover:border-primary/60"
                      >
                        {u.isAdmin ? "Revoke admin" : "Make admin"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
          <span>
            Showing {rows.length} of {q.data?.total ?? 0}
          </span>
          {rows.length < (q.data?.total ?? 0) && (
            <button onClick={() => setLimit((l) => l + 50)} className="px-3 py-1 rounded border border-border hover:text-white">
              Load more
            </button>
          )}
        </div>
      </SectionState>
    </Section>
  );
}
