"use client";
import { useEffect, useState } from "react";
import { getRestaurantSubscription, saveSubscription, extendSubscription, pauseSubscription, resumeSubscription } from "./actions";

type Restaurant = { id: string; name: string; status: string };
type Plan = { id: string; name: string };
type Subscription = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  billing_cycle: "monthly" | "yearly";
  current_period_end: string;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  grace: "Grace period",
  paused: "Paused",
  expired: "Expired",
  cancelled: "Cancelled",
};
const STATUS_STYLE: Record<string, string> = {
  trialing: "bg-chili-500/15 text-chili-500",
  active: "bg-basil-500/15 text-basil-500",
  grace: "bg-turmeric-500/15 text-turmeric-500",
  paused: "bg-ink-faint/15 text-ink-faint",
  expired: "bg-crimson-500/15 text-crimson-500",
  cancelled: "bg-crimson-500/15 text-crimson-500",
};

export function RestaurantSubscriptionPanel({ restaurants, plans, initialRestaurantId }: { restaurants: Restaurant[]; plans: Plan[]; initialRestaurantId?: string }) {
  const [restaurantId, setRestaurantId] = useState(initialRestaurantId ?? restaurants[0]?.id ?? "");
  const [sub, setSub] = useState<Subscription | null>(null);
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    setMessage("");
    const data = (await getRestaurantSubscription(id)) as Subscription | null;
    setSub(data);
    if (data) {
      setPlanId(data.plan_id);
      setCycle(data.billing_cycle);
      setPeriodEnd(data.current_period_end.slice(0, 10));
    }
    setLoading(false);
  }

  useEffect(() => {
    load(restaurantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function handleSave() {
    if (!sub) return;
    setSaving(true);
    await saveSubscription({ restaurantId: sub.restaurant_id, subscriptionId: sub.id, planId, billingCycle: cycle, currentPeriodEnd: periodEnd });
    setMessage("Subscription updated");
    await load(restaurantId);
    setSaving(false);
  }
  async function handleExtend(months: number) {
    if (!sub) return;
    setSaving(true);
    await extendSubscription(sub.id, sub.restaurant_id, months);
    setMessage(`Extended by ${months} month(s)`);
    await load(restaurantId);
    setSaving(false);
  }
  async function handlePauseResume() {
    if (!sub) return;
    setSaving(true);
    if (sub.status === "paused") {
      await resumeSubscription(sub.id, sub.restaurant_id);
      setMessage("Subscription resumed");
    } else {
      await pauseSubscription(sub.id, sub.restaurant_id);
      setMessage("Subscription paused");
    }
    await load(restaurantId);
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 max-w-xl">
      <h2 className="font-display text-lg font-semibold mb-4">Manage a restaurant's subscription</h2>

      <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Restaurant</label>
      <select
        value={restaurantId}
        onChange={(e) => setRestaurantId(e.target.value)}
        className="w-full mt-1 mb-4 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
      >
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      {loading && <p className="text-ink-faint text-sm">Loading…</p>}

      {!loading && !sub && restaurantId && <p className="text-ink-faint text-sm">This restaurant has no subscription yet (still pending activation).</p>}

      {!loading && sub && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-faint">Current status</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[sub.status] ?? ""}`}>{STATUS_LABEL[sub.status] ?? sub.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Plan</label>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Billing cycle</label>
              <select value={cycle} onChange={(e) => setCycle(e.target.value as "monthly" | "yearly")} className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Current period ends</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
              Save changes
            </button>
            <button onClick={() => handleExtend(1)} disabled={saving} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-3 py-2">
              +1 month
            </button>
            <button onClick={() => handleExtend(12)} disabled={saving} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-3 py-2">
              +1 year
            </button>
            <button
              onClick={handlePauseResume}
              disabled={saving}
              className={`rounded-md text-xs font-semibold px-3 py-2 ${
                sub.status === "paused" ? "bg-basil-500 text-white hover:bg-basil-600" : "bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25"
              }`}
            >
              {sub.status === "paused" ? "Resume subscription" : "Pause subscription"}
            </button>
          </div>
          {message && <p className="text-basil-500 text-xs pt-1">{message}</p>}
        </div>
      )}
    </div>
  );
}
