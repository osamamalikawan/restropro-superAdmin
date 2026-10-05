"use client";
import { useMemo, useState } from "react";
import {
  getRestaurantProfile,
  onboardRestaurant,
  activateRestaurant,
  suspendRestaurant,
  reactivateRestaurant,
  terminateRestaurant,
} from "../../actions";

type Restaurant = {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  status: string;
  plan_id: string | null;
  billing_cycle: string;
  created_at: string;
  pending_admin_name: string | null;
  subscriptions: { current_period_start: string; current_period_end: string; status: string }[];
};
type Plan = { id: string; name: string; monthly_price: number };
type Profile = Awaited<ReturnType<typeof getRestaurantProfile>>;

const STATUS_LABEL: Record<string, string> = { pending: "Pending", active: "Active", suspended: "Suspended", terminated: "Terminated", expired: "Expired" };
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-turmeric-500/15 text-turmeric-500",
  active: "bg-basil-500/15 text-basil-500",
  suspended: "bg-crimson-500/15 text-crimson-500",
  terminated: "bg-ink-faint/15 text-ink-faint",
  expired: "bg-crimson-500/15 text-crimson-500",
};
const STATUS_TABS = ["all", "pending", "active", "suspended", "terminated", "expired"];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export function RestaurantsClient({ restaurants, plans }: { restaurants: Restaurant[]; plans: Plan[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardError, setOnboardError] = useState("");
  const [onboarding, setOnboarding] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return restaurants.filter((r) => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.owner_name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [restaurants, search, statusFilter]);

  const planById = new Map(plans.map((p) => [p.id, p]));

  async function openProfile(id: string) {
    setProfileLoading(true);
    setProfile(null);
    try {
      const data = await getRestaurantProfile(id);
      setProfile(data);
    } finally {
      setProfileLoading(false);
    }
  }

  async function runAction(fn: (id: string) => Promise<void>, id: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(id);
    try {
      await fn(id);
      if (profile?.id === id) await openProfile(id); // refresh the open modal, if it's this one
    } finally {
      setBusyId(null);
    }
  }

  async function submitOnboard(formData: FormData) {
    setOnboarding(true);
    setOnboardError("");
    try {
      await onboardRestaurant(formData);
      setShowOnboard(false);
    } catch (e: any) {
      setOnboardError(e.message ?? "Could not onboard restaurant");
    } finally {
      setOnboarding(false);
    }
  }

  function statusActionButton(r: Restaurant) {
    const disabled = busyId === r.id;
    if (r.status === "pending")
      return (
        <button disabled={disabled} onClick={() => runAction(activateRestaurant, r.id)} className="text-xs px-2 py-1 rounded-md bg-basil-500 text-white hover:bg-basil-600 disabled:opacity-50">
          Approve
        </button>
      );
    if (r.status === "active")
      return (
        <button
          disabled={disabled}
          onClick={() => runAction(suspendRestaurant, r.id, `Suspend ${r.name}? Staff won't be able to log in until it's reactivated.`)}
          className="text-xs px-2 py-1 rounded-md bg-raised hover:bg-hover disabled:opacity-50"
        >
          Suspend
        </button>
      );
    if (r.status === "suspended")
      return (
        <button disabled={disabled} onClick={() => runAction(reactivateRestaurant, r.id)} className="text-xs px-2 py-1 rounded-md bg-basil-500 text-white hover:bg-basil-600 disabled:opacity-50">
          Reactivate
        </button>
      );
    return null;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or owner…"
          className="rounded-md border border-line bg-canvas px-3 py-2 text-sm min-w-[220px]"
        />
        <button onClick={() => setShowOnboard(true)} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5">
          + Add restaurant
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusFilter === s ? "bg-chili-500 text-white" : "bg-raised text-ink-mid"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Restaurant</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-left p-3">Contact</th>
              <th className="text-left p-3">Plan</th>
              <th className="text-left p-3">Sub. start</th>
              <th className="text-left p-3">Sub. end</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Registered</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const sub = r.subscriptions?.[0];
              const plan = planById.get(r.plan_id ?? "");
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-3">
                    <div className="font-semibold text-ink-strong">{r.name}</div>
                    <div className="text-xs text-ink-faint">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</div>
                  </td>
                  <td className="p-3">{r.owner_name}</td>
                  <td className="p-3 text-xs text-ink-mid">
                    <div>{r.email}</div>
                    <div className="text-ink-faint">{r.phone || "—"}</div>
                  </td>
                  <td className="p-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-raised text-ink-mid">{plan?.name ?? "—"}</span>
                  </td>
                  <td className="p-3 text-xs text-ink-faint">{fmtDate(sub?.current_period_start)}</td>
                  <td className="p-3 text-xs text-ink-faint">{fmtDate(sub?.current_period_end)}</td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </td>
                  <td className="p-3 text-xs text-ink-faint">{fmtDate(r.created_at)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openProfile(r.id)} className="text-xs px-2 py-1 rounded-md bg-raised hover:bg-hover" title="View profile">
                        View
                      </button>
                      <a href={`/super-admin/subscriptions?restaurant=${r.id}`} className="text-xs px-2 py-1 rounded-md bg-raised hover:bg-hover" title="Manage subscription">
                        Sub.
                      </a>
                      {statusActionButton(r)}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-ink-faint">
                  No restaurants match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Profile modal ---- */}
      {(profileLoading || profile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setProfile(null)}>
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {profileLoading && <p className="text-ink-faint text-sm">Loading…</p>}
            {profile && (
              <>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-chili-500 text-white flex items-center justify-center font-display font-semibold text-lg shrink-0">
                    {initials(profile.name)}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-display text-lg font-semibold">{profile.name}</h2>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[profile.status] ?? ""}`}>{STATUS_LABEL[profile.status] ?? profile.status}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-raised text-ink-mid">{(profile as any).subscription_plans?.name ?? "No plan"}</span>
                    </div>
                  </div>
                  <button onClick={() => setProfile(null)} className="text-ink-faint hover:text-ink-strong text-xl leading-none">
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>
                    <div className="text-xs text-ink-faint">Owner</div>
                    <div className="font-semibold">{profile.owner_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Email</div>
                    <div className="font-semibold truncate">{profile.email}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Phone</div>
                    <div className="font-semibold">{profile.phone || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Location</div>
                    <div className="font-semibold">{[profile.city, profile.country].filter(Boolean).join(", ") || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Subscription period</div>
                    <div className="font-semibold">
                      {fmtDate((profile as any).subscriptions?.[0]?.current_period_start)} → {fmtDate((profile as any).subscriptions?.[0]?.current_period_end)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-faint">Registered</div>
                    <div className="font-semibold">{fmtDate(profile.created_at)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="rounded-lg border border-line p-3 text-center">
                    <div className="text-xl font-display font-bold">{profile.employeeCount}</div>
                    <div className="text-[11px] text-ink-faint">Employees</div>
                  </div>
                  <div className="rounded-lg border border-line p-3 text-center">
                    <div className="text-xl font-display font-bold">{profile.orderCount}</div>
                    <div className="text-[11px] text-ink-faint">Orders logged</div>
                  </div>
                  <div className="rounded-lg border border-line p-3 text-center">
                    <div className="text-xl font-display font-bold">{profile.productCount}</div>
                    <div className="text-[11px] text-ink-faint">Menu items</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {profile.status === "pending" && (
                    <button onClick={() => runAction(activateRestaurant, profile.id)} disabled={busyId === profile.id} className="rounded-md bg-basil-500 hover:bg-basil-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
                      Approve
                    </button>
                  )}
                  {profile.status === "active" && (
                    <button
                      onClick={() => runAction(suspendRestaurant, profile.id, `Suspend ${profile.name}? Staff won't be able to log in until it's reactivated.`)}
                      disabled={busyId === profile.id}
                      className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2 disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  )}
                  {profile.status === "suspended" && (
                    <button onClick={() => runAction(reactivateRestaurant, profile.id)} disabled={busyId === profile.id} className="rounded-md bg-basil-500 hover:bg-basil-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
                      Reactivate
                    </button>
                  )}
                  {profile.status !== "terminated" && (
                    <button
                      onClick={() =>
                        runAction(terminateRestaurant, profile.id, `Terminate ${profile.name}? This permanently removes access and should be used carefully.`)
                      }
                      disabled={busyId === profile.id}
                      className="rounded-md bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25 text-xs font-semibold px-4 py-2 disabled:opacity-50"
                    >
                      Terminate
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---- Onboard modal ---- */}
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowOnboard(false)}>
          <form action={submitOnboard} className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold mb-1">Add restaurant</h2>
            <p className="text-xs text-ink-faint mb-3">Creates the owner's account and a pending restaurant, same as self-signup — you'll still Approve it from the list.</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Restaurant name</label>
                <input name="restaurantName" required className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Owner name</label>
                <input name="ownerName" required className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Owner email</label>
                <input name="email" type="email" required className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Owner password</label>
                <input name="password" type="password" required minLength={6} className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Phone</label>
                <input name="phone" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">City</label>
                <input name="city" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">First admin's name</label>
                <input name="adminName" required className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Admin PIN (4 digits)</label>
                <input name="adminPin" required maxLength={4} pattern="\d{4}" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Plan</label>
                <select name="planId" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — Rs {Number(p.monthly_price).toLocaleString()}/mo
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-mid uppercase tracking-wide">Billing cycle</label>
                <select name="billingCycle" className="w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>

            {onboardError && <p className="text-crimson-500 text-xs">{onboardError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={onboarding} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
                {onboarding ? "Creating…" : "Create restaurant"}
              </button>
              <button type="button" onClick={() => setShowOnboard(false)} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
