"use client";
import { useState } from "react";
import { createChain, linkBranch, unlinkBranch, resetChainOwnerPassword, type ChainRow } from "./actions";

type Avail = { id: string; name: string; city: string | null; status: string };
const inputCls = "rounded-md border border-line bg-canvas px-3 py-2 text-sm";
const btnCls = "rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-2 disabled:opacity-50";

export function ChainsClient({ chains, available }: { chains: ChainRow[]; available: Avail[] }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [pick, setPick] = useState<Record<string, { restaurantId: string; branchName: string }>>({});
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>, after?: () => void) {
    setBusy(true);
    try { await fn(); after?.(); } catch (e: any) { window.alert(e.message ?? "Something went wrong"); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="rounded-lg border border-line bg-surface p-4 mb-6">
        <div className="text-sm font-semibold mb-3">New multi-branch account</div>
        <div className="flex flex-wrap gap-2">
          <input className={inputCls} placeholder="Chain name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inputCls} placeholder="Owner email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={inputCls} placeholder="Password (min 8)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className={btnCls} disabled={busy} onClick={() => run(() => createChain(form), () => setForm({ name: "", email: "", password: "" }))}>Create account</button>
        </div>
      </div>

      {chains.length === 0 && <p className="text-sm text-ink-mid">No multi-branch accounts yet.</p>}
      {chains.map((c) => {
        const p = pick[c.id] ?? { restaurantId: "", branchName: "" };
        return (
          <div key={c.id} className="rounded-lg border border-line bg-surface p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-ink-mid">Owner: {c.ownerEmails.join(", ") || "none"}</div>
              </div>
              <button className="text-xs text-ink-mid underline" onClick={() => { const pw = window.prompt("New owner password (min 8 characters)"); if (pw) run(() => resetChainOwnerPassword(c.id, pw)); }}>Reset owner password</button>
            </div>
            <table className="w-full text-sm mb-3">
              <tbody>
                {c.branches.map((b) => (
                  <tr key={b.restaurantId} className="border-t border-line">
                    <td className="py-2">{b.branchName || b.name}{b.branchName && <span className="text-xs text-ink-mid"> ({b.name})</span>}</td>
                    <td className="py-2 text-xs text-ink-mid">{b.status}</td>
                    <td className="py-2 text-right"><button className="text-xs text-red-400" disabled={busy} onClick={() => { if (window.confirm(`Unlink ${b.name} from ${c.name}?`)) run(() => unlinkBranch(b.restaurantId)); }}>Unlink</button></td>
                  </tr>
                ))}
                {c.branches.length === 0 && <tr><td className="py-2 text-xs text-ink-mid">No branches linked yet.</td></tr>}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2">
              <select className={inputCls} value={p.restaurantId} onChange={(e) => setPick({ ...pick, [c.id]: { ...p, restaurantId: e.target.value } })}>
                <option value="">Link a restaurant…</option>
                {available.map((r) => <option key={r.id} value={r.id}>{r.name}{r.city ? `, ${r.city}` : ""} ({r.status})</option>)}
              </select>
              <input className={inputCls} placeholder="Branch label (optional)" value={p.branchName} onChange={(e) => setPick({ ...pick, [c.id]: { ...p, branchName: e.target.value } })} />
              <button className={btnCls} disabled={busy || !p.restaurantId} onClick={() => run(() => linkBranch({ chainId: c.id, ...p }), () => setPick({ ...pick, [c.id]: { restaurantId: "", branchName: "" } }))}>Link branch</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
