"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getRestaurantProfile,
  listTenantPayments,
  recordTenantPayment,
  resetRestaurantData,
  activateRestaurant,
  suspendRestaurant,
  reactivateRestaurant,
  terminateRestaurant,
} from "../../actions";

type Profile = Awaited<ReturnType<typeof getRestaurantProfile>>;
type Payments = Awaited<ReturnType<typeof listTenantPayments>>;

const STATUS_LABEL: Record<string, string> = { pending: "Pending", active: "Active", suspended: "Suspended", terminated: "Terminated", expired: "Expired" };
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-turmeric-500/15 text-turmeric-500",
  active: "bg-basil-500/15 text-basil-500",
  suspended: "bg-crimson-500/15 text-crimson-500",
  terminated: "bg-ink-faint/15 text-ink-faint",
  expired: "bg-crimson-500/15 text-crimson-500",
};

const SCOPES: { key: keyof Profile["scopeCounts"]; label: string; hint: string }[] = [
  { key: "sales", label: "Sales & orders", hint: "every order, its items and payments" },
  { key: "accounts", label: "Accounts ledger", hint: "income and expense entries" },
  { key: "customers", label: "Customers", hint: "orders stay, just unlinked" },
  { key: "menu", label: "Menu", hint: "products, deals, recipes and menu categories" },
  { key: "inventory", label: "Inventory items", hint: "with restock and production history" },
  { key: "suppliers", label: "Suppliers", hint: "with their ledger and promised payments" },
  { key: "expenses", label: "Expenses", hint: "including recurring expenses" },
  { key: "shifts", label: "Shift & attendance records", hint: "clock-in history" },
  { key: "tables_delivery", label: "Tables & delivery areas", hint: "orders keep existing, just unlinked" },
  { key: "employees", label: "Other employees", hint: "everyone except the main admin" },
];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString() : "—";
}
function fmtMoney(n: number) {
  return "Rs " + Number(n).toLocaleString();
}
function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  return `${Math.round(days / 30)} months ago`;
}

const inputCls = "w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm";
const labelCls = "text-xs font-semibold text-ink-mid uppercase tracking-wide";

export function ProfileModal({ restaurantId, onClose }: { restaurantId: string | null; onClose: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payments, setPayments] = useState<Payments | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  // payment form
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payExtend, setPayExtend] = useState(true);

  // data tools
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmName, setConfirmName] = useState("");

  const load = useCallback(async (id: string) => {
    setLoadError("");
    try {
      const [p, pay] = await Promise.all([getRestaurantProfile(id), listTenantPayments(id)]);
      setProfile(p);
      setPayments(pay);
    } catch (e: any) {
      setLoadError(e.message ?? "Could not load this restaurant");
    }
  }, []);

  useEffect(() => {
    setProfile(null);
    setPayments(null);
    setNotice("");
    setActionError("");
    setShowPay(false);
    setPicked([]);
    setConfirmName("");
    if (!restaurantId) return;
    setLoading(true);
    load(restaurantId).finally(() => setLoading(false));
  }, [restaurantId, load]);

  if (!restaurantId) return null;

  async function run(fn: () => Promise<unknown>, okMessage?: string | ((r: any) => string)): Promise<boolean> {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await fn();
      if (okMessage) setNotice(typeof okMessage === "function" ? okMessage(result) : okMessage);
      await load(restaurantId as string);
      return true;
    } catch (e: any) {
      setActionError(e.message ?? "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function lifecycle(fn: (id: string) => Promise<unknown>, confirmMsg?: string, ok?: string | ((r: any) => string)) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    run(() => fn(restaurantId as string), ok);
  }

  function describeDeleted(result: Record<string, number>) {
    const parts = Object.entries(result).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`);
    return parts.length ? `Deleted: ${parts.join(", ")}.` : "Nothing to delete for those options.";
  }

  function deleteSelected() {
    if (!profile || !picked.length) return;
    const names = SCOPES.filter((s) => picked.includes(s.key)).map((s) => s.label.toLowerCase());
    if (!window.confirm(`Permanently delete ${names.join(", ")} for ${profile.name}? This cannot be undone.`)) return;
    run(() => resetRestaurantData(profile.id, picked), (r) => describeDeleted(r)).then((ok) => ok && setPicked([]));
  }

  function resetEverything() {
    if (!profile) return;
    if (!window.confirm(`Reset ALL data for ${profile.name}? Only the main admin user is kept. This cannot be undone.`)) return;
    run(() => resetRestaurantData(profile.id, ["everything"], confirmName), (r) => `Reset complete. ${describeDeleted(r)}`).then((ok) => ok && setConfirmName(""));
  }

  function submitPayment() {
    if (!profile) return;
    run(
      () =>
        recordTenantPayment({
          restaurantId: profile.id,
          amount: Number(payAmount),
          method: payMethod,
          reference: payRef,
          note: payNote,
          paidAt: payDate,
          extendSubscription: payExtend,
        }),
      "Payment recorded."
    ).then((ok) => {
      if (!ok) return;
      setPayAmount("");
      setPayRef("");
      setPayNote("");
      setShowPay(false);
    });
  }

  const sub = (profile as any)?.subscriptions?.[0];
  const cycle = profile?.billing_cycle === "yearly" ? "year" : "month";
  const menuNeedsSales = picked.includes("menu") && !picked.includes("sales") && (profile?.scopeCounts.sales ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-3xl rounded-xl border border-line bg-surface p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading && <p className="text-ink-faint text-sm">Loading…</p>}
        {loadError && <p className="text-crimson-500 text-sm">{loadError}</p>}

        {profile && (
          <>
            {/* header */}
            <div className="flex items-start gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-chili-500 text-white flex items-center justify-center font-display font-semibold text-lg shrink-0">
                {initials(profile.name)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-xl font-semibold truncate">{profile.name}</h2>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[profile.status] ?? ""}`}>{STATUS_LABEL[profile.status] ?? profile.status}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-raised text-ink-mid">{(profile as any).subscription_plans?.name ?? "No plan"}</span>
                </div>
              </div>
              <button onClick={onClose} disabled={busy} className="text-ink-faint hover:text-ink-strong text-2xl leading-none disabled:opacity-40" aria-label="Close">
                ×
              </button>
            </div>

            {notice && <p className="mb-3 rounded-md bg-basil-500/10 border border-basil-500/30 text-basil-500 text-xs px-3 py-2">{notice}</p>}
            {actionError && <p className="mb-3 rounded-md bg-crimson-500/10 border border-crimson-500/30 text-crimson-500 text-xs px-3 py-2">{actionError}</p>}

            {/* activity + headcount */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="rounded-lg border border-line p-3 col-span-2">
                <div className="text-[11px] text-ink-faint uppercase tracking-wide">Last activity</div>
                {profile.lastActivityAt ? (
                  <>
                    <div className="font-display font-semibold">{timeAgo(profile.lastActivityAt)}</div>
                    <div className="text-[11px] text-ink-faint">
                      {new Date(profile.lastActivityAt).toLocaleString()} · {profile.lastActivitySource}
                    </div>
                  </>
                ) : (
                  <div className="font-display font-semibold text-ink-mid">No activity yet</div>
                )}
              </div>
              <div className="rounded-lg border border-line p-3 text-center">
                <div className="text-xl font-display font-bold">{profile.employeesTotal}</div>
                <div className="text-[11px] text-ink-faint">Employees ({profile.employeesActive} active)</div>
              </div>
              <div className="rounded-lg border border-line p-3 text-center">
                <div className="text-xl font-display font-bold">{profile.ordersLogged}</div>
                <div className="text-[11px] text-ink-faint">Orders logged</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-5">
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
                  {fmtDate(sub?.current_period_start)} → {fmtDate(sub?.current_period_end)}
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-faint">Registered</div>
                <div className="font-semibold">{fmtDate(profile.created_at)}</div>
              </div>
            </div>

            {/* lifecycle */}
            <div className="flex flex-wrap gap-2 mb-6">
              {profile.status === "pending" && (
                <button onClick={() => lifecycle(activateRestaurant)} disabled={busy} className="rounded-md bg-basil-500 hover:bg-basil-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
                  Approve
                </button>
              )}
              {profile.status === "active" && (
                <button
                  onClick={() => lifecycle(suspendRestaurant, `Suspend ${profile.name}? Staff won't be able to log in until it's reactivated.`)}
                  disabled={busy}
                  className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2 disabled:opacity-50"
                >
                  Suspend
                </button>
              )}
              {(profile.status === "suspended" || profile.status === "terminated" || profile.status === "expired") && (
                <button
                  onClick={() =>
                    lifecycle(
                      reactivateRestaurant,
                      profile.status === "suspended"
                        ? `Reactivate ${profile.name}? Staff will be able to log in again.`
                        : `Reactivate ${profile.name}? It is currently ${profile.status}. If its subscription has lapsed, a fresh billing period starts today.`,
                      (r) => (r?.renewed ? "Reactivated, and a new subscription period was started." : "Reactivated.")
                    )
                  }
                  disabled={busy}
                  className="rounded-md bg-basil-500 hover:bg-basil-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50"
                >
                  Reactivate
                </button>
              )}
              {profile.status !== "terminated" && profile.status !== "pending" && (
                <button
                  onClick={() => lifecycle(terminateRestaurant, `Terminate ${profile.name}? Staff lose access. You can reactivate it later if needed.`)}
                  disabled={busy}
                  className="rounded-md bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25 text-xs font-semibold px-4 py-2 disabled:opacity-50"
                >
                  Terminate
                </button>
              )}
              <a href={`/super-admin/subscriptions?restaurant=${profile.id}`} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2">
                Manage subscription
              </a>
            </div>

            {/* payments */}
            <section className="mb-6 rounded-xl border border-line p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display font-semibold">Payments from this restaurant</h3>
                  <p className="text-xs text-ink-faint">
                    {payments ? `${payments.payments.length} recorded · ${fmtMoney(payments.total)} total` : "Loading…"} · kept even after a reset
                  </p>
                </div>
                <button onClick={() => setShowPay((v) => !v)} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5">
                  {showPay ? "Close" : "+ Record payment"}
                </button>
              </div>

              {showPay && (
                <div className="rounded-lg bg-canvas border border-line p-3 mb-3 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Amount (Rs)</label>
                      <input type="number" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Method</label>
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="jazzcash">JazzCash</option>
                        <option value="easypaisa">Easypaisa</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Paid on</label>
                      <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Reference</label>
                      <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Receipt / transaction no." className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Note</label>
                      <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink-mid">
                    <input type="checkbox" checked={payExtend} onChange={(e) => setPayExtend(e.target.checked)} />
                    Also extend the subscription by 1 {cycle}
                  </label>
                  <button onClick={submitPayment} disabled={busy || !payAmount} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
                    {busy ? "Saving…" : "Save payment"}
                  </button>
                </div>
              )}

              {payments && payments.payments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-ink-faint uppercase">
                      <tr>
                        <th className="text-left py-1.5">Date</th>
                        <th className="text-left py-1.5">Amount</th>
                        <th className="text-left py-1.5">Method</th>
                        <th className="text-left py-1.5">Covers until</th>
                        <th className="text-left py-1.5">Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.payments.map((p: any) => (
                        <tr key={p.id} className="border-t border-line">
                          <td className="py-1.5">{fmtDate(p.paid_at)}</td>
                          <td className="py-1.5 font-semibold">{fmtMoney(p.amount)}</td>
                          <td className="py-1.5 capitalize">{String(p.method).replace("_", " ")}</td>
                          <td className="py-1.5">{fmtDate(p.period_end)}</td>
                          <td className="py-1.5 text-ink-mid">{p.reference || p.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                payments && <p className="text-xs text-ink-faint">No payments recorded yet.</p>
              )}
            </section>

            {/* data tools */}
            <section className="rounded-xl border border-crimson-500/40 p-4">
              <h3 className="font-display font-semibold text-crimson-500">Data tools</h3>
              <p className="text-xs text-ink-mid mt-1 mb-3">
                Deleting is permanent. Always kept: the main admin user, the restaurant account and subscription, settings, payment methods, roles, audit log and the payment records above.
              </p>

              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-3">
                {SCOPES.map((s) => {
                  const n = profile.scopeCounts[s.key];
                  return (
                    <label key={s.key} className={`flex items-start gap-2 text-sm ${n === 0 ? "opacity-50" : ""}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={picked.includes(s.key)}
                        onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((k) => k !== s.key)))}
                      />
                      <span>
                        <span className="font-medium">{s.label}</span> <span className="text-ink-faint text-xs">({n})</span>
                        <span className="block text-[11px] text-ink-faint">{s.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {menuNeedsSales && (
                <p className="text-xs text-turmeric-500 mb-2">Menu items are used by past orders, so tick "Sales &amp; orders" as well or the database will refuse.</p>
              )}

              <button onClick={deleteSelected} disabled={busy || !picked.length} className="rounded-md bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25 text-xs font-semibold px-4 py-2 disabled:opacity-40">
                {busy ? "Working…" : `Delete selected${picked.length ? ` (${picked.length})` : ""}`}
              </button>

              <div className="mt-4 pt-4 border-t border-line">
                <div className="font-semibold text-sm mb-1">Reset everything</div>
                <p className="text-xs text-ink-faint mb-2">
                  Clears all of the above in one step and leaves only the main admin. Type <b className="text-ink-mid">{profile.name}</b> to confirm.
                </p>
                <div className="flex gap-2">
                  <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder="Restaurant name" className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
                  <button
                    onClick={resetEverything}
                    disabled={busy || confirmName.trim() !== profile.name}
                    className="rounded-md bg-crimson-500 hover:bg-crimson-500/90 text-white text-xs font-semibold px-4 py-2 disabled:opacity-40"
                  >
                    Reset everything
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
