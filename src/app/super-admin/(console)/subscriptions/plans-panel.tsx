"use client";
import { useState } from "react";
import { savePlan, togglePlanActive } from "./actions";

type Plan = {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  trial_days: number;
  max_users: number | null;
  features: string[];
  is_active: boolean;
};

const emptyForm = { id: "", name: "", monthlyPrice: 0, yearlyPrice: 0, trialDays: 14, maxUsers: "", features: "" };

export function PlansPanel({ plans, restaurantCounts }: { plans: Plan[]; restaurantCounts: Record<string, number> }) {
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setForm(emptyForm);
    setError("");
  }
  function openEdit(p: Plan) {
    setForm({
      id: p.id,
      name: p.name,
      monthlyPrice: p.monthly_price,
      yearlyPrice: p.yearly_price,
      trialDays: p.trial_days,
      maxUsers: p.max_users?.toString() ?? "",
      features: p.features.join(", "),
    });
    setError("");
  }

  async function submit() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await savePlan({
        id: form.id || undefined,
        name: form.name,
        monthlyPrice: Number(form.monthlyPrice),
        yearlyPrice: Number(form.yearlyPrice),
        trialDays: Number(form.trialDays),
        maxUsers: form.maxUsers.trim() ? Number(form.maxUsers) : null,
        features: form.features.split(",").map((f) => f.trim()).filter(Boolean),
      });
      setForm(null);
    } catch (e: any) {
      setError(e.message ?? "Could not save plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold">Subscription plans</h2>
        <button onClick={openCreate} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5">
          + Create plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-line bg-surface p-4 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-display font-semibold text-ink-strong">{p.name}</div>
                <div className="text-xs text-ink-faint">{restaurantCounts[p.id] ?? 0} restaurant(s) on this plan</div>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.is_active ? "bg-basil-500/15 text-basil-500" : "bg-ink-faint/15 text-ink-faint"}`}>
                {p.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm my-2">
              <div>
                <div className="text-xs text-ink-faint">Monthly</div>
                <div className="font-semibold">Rs {Number(p.monthly_price).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-ink-faint">Yearly</div>
                <div className="font-semibold">Rs {Number(p.yearly_price).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-ink-faint">Trial</div>
                <div className="font-semibold">{p.trial_days} days</div>
              </div>
              <div>
                <div className="text-xs text-ink-faint">Max users</div>
                <div className="font-semibold">{p.max_users ?? "Unlimited"}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 my-2">
              {p.features.map((f) => (
                <span key={f} className="text-[11px] bg-raised px-2 py-0.5 rounded-full text-ink-mid">
                  {f}
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-auto pt-3">
              <button onClick={() => openEdit(p)} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-3 py-1.5">
                Edit
              </button>
              <button
                onClick={() => togglePlanActive(p.id, !p.is_active)}
                className={`rounded-md text-xs font-semibold px-3 py-1.5 ${
                  p.is_active ? "bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25" : "bg-basil-500 text-white hover:bg-basil-600"
                }`}
              >
                {p.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
        {plans.length === 0 && <div className="text-ink-faint text-sm col-span-full py-6 text-center">No plans yet, create the first one.</div>}
      </div>

      {form && (
        <div className="rounded-xl border border-line bg-surface p-5 max-w-lg">
          <h3 className="font-display font-semibold mb-4">{form.id ? "Edit plan" : "Create plan"}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Plan name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                placeholder="e.g. Growth"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Monthly (Rs)</label>
                <input
                  type="number"
                  value={form.monthlyPrice}
                  onChange={(e) => setForm({ ...form, monthlyPrice: Number(e.target.value) })}
                  className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Yearly (Rs)</label>
                <input
                  type="number"
                  value={form.yearlyPrice}
                  onChange={(e) => setForm({ ...form, yearlyPrice: Number(e.target.value) })}
                  className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Trial days</label>
                <input
                  type="number"
                  value={form.trialDays}
                  onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
                  className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Max users (blank = unlimited)</label>
                <input
                  value={form.maxUsers}
                  onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
                  className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Features (comma separated)</label>
              <input
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
                placeholder="Multi-location, Priority support"
              />
            </div>
            {error && <p className="text-crimson-500 text-xs">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={submit} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
                {saving ? "Saving…" : "Save plan"}
              </button>
              <button onClick={() => setForm(null)} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
