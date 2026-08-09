# Admin Console — Gaps and Fixes

Findings below were each confirmed against the code and the live database policies. Ordered by real-world damage.

## 1. Marking a payment "verified" in admin does nothing for the customer

Confirmed: a plan is only activated inside the payment submission flow, which upserts the subscription right after the on-chain check. The admin Payments table writes the status column directly on the row — no subscription is created, no period dates are set. So when a customer pays and their transaction needs manual approval, the admin flips the dropdown to "verified", the row turns green, and the customer still has no plan.

Fix: replace the raw status dropdown with real actions that run on the server — **Approve & activate** (marks verified and grants/extends the plan for the paid tier and cycle, same logic as automatic verification) and **Reject** (with a short reason). Show the resulting plan dates in the row so it's obvious the grant landed.

## 2. Payments stuck on "pending" are never revisited

Confirmed: when the chain lookup is unavailable the payment is saved as pending and the customer is told verification "will retry automatically". Nothing retries it — there is no background job touching payments. Those customers pay and wait forever unless someone notices.

Fix: a **Re-check on-chain** button per pending row that re-runs the same verification and activates on success, plus a background sweep of pending payments on the existing scheduled-job pattern so it self-heals without an admin.

## 3. No pending queue, no counts, no way to find anything

Every table loads the newest 500 rows with no search, no filter, no pagination and no indication it was truncated. With any real user base an admin cannot find a specific customer, and pending payments — the only rows that actually need action — are buried among all the rest.

Fix: a **Needs attention** panel at the top (pending payments, failed background runs, failed deliveries in the last 24h), a search box on the users, subscriptions and payments tables, a status filter on payments, and an explicit "showing newest N" note with load-more.

## 4. Nothing that answers "how is the business doing"

There are no totals anywhere: no signups today/this week, no active plan counts by tier, no revenue collected, no churn or expiring-soon list.

Fix: a compact metrics strip — total users, new users (24h/7d), active Pro and Elite counts, revenue verified (30d), and plans expiring in the next 7 days.

## 5. An admin can lock everyone out, silently

The Make/Revoke admin button applies instantly with no confirmation. An admin can revoke their own admin role and immediately lose access, and nothing records who granted or revoked what.

Fix: block self-revocation, refuse to remove the last remaining admin, require a confirmation step for role changes, and record every admin action (role change, payment decision, plan override, kill switch, feature flag) in an audit trail with a **Recent admin activity** panel.

## 6. Failures are invisible or hostile

Errors from the users, subscriptions, payments and roles tables are swallowed — the section just renders empty, indistinguishable from "no data". Write failures use a raw browser `alert()`. A non-admin visiting `/admin` is silently bounced to the home page with no explanation.

Fix: per-section error states with a retry, toast notifications on success and failure, skeletons while loading, and a plain "You don't have access to this area" screen instead of a silent redirect.

## 7. No per-user view

To answer "what is going on with this customer" an admin has to read four separate tables and match user IDs by eye.

Fix: clicking a user opens a detail panel: profile and join date, plan and period end, payment history, alert delivery outcomes, autopilot state (armed / paper / kill-switched) and connected-account status (never any key material), with the plan-override and role actions in one place.

## 8. Operational blind spots

System health shows the last 10 runs, but a job that stopped running entirely looks identical to a healthy one, and there is no way to trigger a run or clear a stuck lock. Delivery counts show totals with no way to see which alert failed and why.

Fix: mark a job stale when its last successful run is older than its expected interval, add a **Run now** action for each background job, and make the failed-delivery count clickable to a list of recent failures with their error text.

## Technical notes

- All new admin mutations go through `src/lib/admin.functions.ts` server functions behind the existing `assertAdmin` check, using the admin client — the page stops writing to `payment_transactions`, `subscriptions` and `user_roles` from the browser. Existing row-level policies stay as the second line of defence.
- Payment approval reuses the activation logic from the submission flow, extracted into a shared server helper so manual and automatic approval can never diverge.
- Audit trail: a new `admin_audit` table (actor, action, target, detail, timestamp) with admin-only read, service-role write, plus grants and RLS in the same migration.
- Pending-payment sweep runs as a new public scheduled route alongside the existing alert and subscription jobs, using the same run-lock and `system_runs` logging.
- Metrics come from aggregate queries in a single server function, not by counting rows fetched into the browser.
- The console is split into per-section components under `src/components/eliteflux/admin/`; `src/routes/admin.tsx` becomes a thin shell. No changes to intelligence, coach, or autopilot behaviour.
