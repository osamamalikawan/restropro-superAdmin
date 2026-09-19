import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus } from "@/lib/subscription";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  terminated: "Terminated",
  expired: "Expired",
};
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-turmeric-500/15 text-turmeric-500",
  active: "bg-basil-500/15 text-basil-500",
  suspended: "bg-crimson-500/15 text-crimson-500",
  terminated: "bg-crimson-500/15 text-crimson-500",
  expired: "bg-ink-faint/15 text-ink-faint",
};

export default async function SuperAdminDashboardPage() {
  const admin = createAdminClient();

  const [{ data: restaurants }, { data: subs }, { data: plans }] = await Promise.all([
    admin
      .from("restaurants")
      .select("id, name, owner_name, city, country, status, plan_id, billing_cycle, created_at")
      .order("created_at", { ascending: false }),
    admin.from("subscriptions").select("restaurant_id, current_period_end, grace_until, status"),
    admin.from("subscription_plans").select("id, name, monthly_price, yearly_price"),
  ]);

  const rs = restaurants ?? [];
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const subByRestaurant = new Map((subs ?? []).map((s) => [s.restaurant_id, s]));

  const active = rs.filter((r) => r.status === "active").length;
  const pending = rs.filter((r) => r.status === "pending").length;
  const suspended = rs.filter((r) => r.status === "suspended").length;
  const terminated = rs.filter((r) => r.status === "terminated").length;

  // "Expiring soon" and MRR both need the *computed* status (paused/grace/expired can drift
  // from the raw restaurants.status column), so run every active restaurant's subscription
  // through the same computeStatus() the staff-login gate uses.
  let expiringSoon = 0;
  let mrr = 0;
  const now = new Date();
  for (const r of rs) {
    const sub = subByRestaurant.get(r.id);
    if (!sub) continue;
    const status = computeStatus(sub, now);
    if (status !== "active" && status !== "trialing") continue;
    const plan = planById.get(r.plan_id ?? "");
    if (plan) mrr += r.billing_cycle === "yearly" ? Number(plan.yearly_price) / 12 : Number(plan.monthly_price);
    const daysLeft = (new Date(sub.current_period_end).getTime() - now.getTime()) / 86400000;
    if (daysLeft >= 0 && daysLeft <= 7) expiringSoon++;
  }

  const kpis: { label: string; value: string | number; delta: string; textCls: string }[] = [
    { label: "Total restaurants", value: rs.length, delta: `${active} active`, textCls: "text-chili-500" },
    { label: "Pending approvals", value: pending, delta: pending ? "needs review" : "all clear", textCls: "text-turmeric-500" },
    { label: "Monthly recurring rev.", value: `Rs ${Math.round(mrr).toLocaleString()}`, delta: "MRR across all tenants", textCls: "text-basil-500" },
    { label: "Expiring within 7 days", value: expiringSoon, delta: "renew or follow up", textCls: "text-crimson-500" },
  ];

  const recent = rs.slice(0, 6);

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-ink-mid text-sm mb-6">Platform-wide overview across every tenant.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
            <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${k.textCls}`}>{k.label}</div>
            <div className="font-display text-2xl font-bold text-ink-strong">{k.value}</div>
            <div className={`text-xs mt-1 ${k.textCls}`}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          ["Active", active, "bg-basil-500/15 text-basil-500"],
          ["Pending", pending, "bg-turmeric-500/15 text-turmeric-500"],
          ["Suspended", suspended, "bg-crimson-500/15 text-crimson-500"],
          ["Terminated", terminated, "bg-crimson-500/15 text-crimson-500"],
        ].map(([label, count, cls]) => (
          <div key={label as string} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${cls}`}>
            {label} <b>{count}</b>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="font-display font-semibold mb-4">Recent registrations</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-line">
              <th className="pb-2">Restaurant</th>
              <th className="pb-2">Owner</th>
              <th className="pb-2">Plan</th>
              <th className="pb-2">Registered</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="py-2.5">
                  <div className="font-semibold text-ink-strong">{r.name}</div>
                  <div className="text-xs text-ink-faint">{[r.city, r.country].filter(Boolean).join(", ")}</div>
                </td>
                <td className="py-2.5">{r.owner_name}</td>
                <td className="py-2.5 text-xs">{planById.get(r.plan_id ?? "")?.name ?? "—"}</td>
                <td className="py-2.5 text-xs text-ink-faint">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="py-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? ""}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-faint text-sm">
                  No restaurants registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
