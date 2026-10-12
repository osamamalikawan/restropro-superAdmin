"use client";
import { useMemo, useState } from "react";
import { saveIngredient, toggleIngredient, deleteIngredient } from "./actions";

type Ingredient = { id: string; name: string; category: string; item_type: "ready_made" | "self_made"; unit: string; is_active: boolean };

const inputCls = "w-full mt-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm";
const labelCls = "text-xs font-semibold text-ink-mid uppercase tracking-wide";
const emptyForm = { id: "", name: "", category: "", itemType: "ready_made" as "ready_made" | "self_made", unit: "pcs" };

export function IngredientsClient({ ingredients }: { ingredients: Ingredient[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    ingredients.forEach((i) => counts.set(i.category, (counts.get(i.category) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [ingredients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ingredients.filter((i) => (category === "all" || i.category === category) && (!q || i.name.toLowerCase().includes(q)));
  }, [ingredients, search, category]);

  function openEdit(i: Ingredient) {
    setForm({ id: i.id, name: i.name, category: i.category, itemType: i.item_type, unit: i.unit });
    setError("");
  }

  async function submit() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await saveIngredient({ id: form.id || undefined, name: form.name, category: form.category, itemType: form.itemType, unit: form.unit });
      setForm(null);
    } catch (e: any) {
      setError(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function act(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } catch (e: any) {
      window.alert(e.message ?? "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredient…" className="rounded-md border border-line bg-canvas px-3 py-2 text-sm min-w-[220px]" />
        <button
          onClick={() => {
            setForm({ ...emptyForm, category: category === "all" ? "" : category });
            setError("");
          }}
          className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-3 py-1.5"
        >
          + Add ingredient
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setCategory("all")} className={`text-xs font-semibold px-3 py-1 rounded-full ${category === "all" ? "bg-chili-500 text-white" : "bg-raised text-ink-mid"}`}>
          All ({ingredients.length})
        </button>
        {categories.map(([c, n]) => (
          <button key={c} onClick={() => setCategory(c)} className={`text-xs font-semibold px-3 py-1 rounded-full ${category === c ? "bg-chili-500 text-white" : "bg-raised text-ink-mid"}`}>
            {c} ({n})
          </button>
        ))}
      </div>

      {form && (
        <div className="rounded-xl border border-line bg-surface p-4 mb-5 max-w-xl space-y-3">
          <h3 className="font-display font-semibold">{form.id ? "Edit ingredient" : "Add ingredient"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input list="ingredient-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Spices & Masala" className={inputCls} />
              <datalist id="ingredient-categories">
                {categories.map(([c]) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value as any })} className={inputCls}>
                <option value="ready_made">Ready Made</option>
                <option value="self_made">Self Made</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Default unit</label>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, ltr…" className={inputCls} />
            </div>
          </div>
          {error && <p className="text-crimson-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">Ingredient</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Unit</th>
              <th className="text-left p-3">Visible to restaurants</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className={`border-t border-line ${i.is_active ? "" : "opacity-60"}`}>
                <td className="p-3 font-medium text-ink-strong">{i.name}</td>
                <td className="p-3 text-ink-mid">{i.category}</td>
                <td className="p-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${i.item_type === "self_made" ? "bg-basil-500/15 text-basil-500" : "bg-turmeric-500/15 text-turmeric-500"}`}>
                    {i.item_type === "self_made" ? "Self Made" : "Ready Made"}
                  </span>
                </td>
                <td className="p-3 text-ink-mid">{i.unit}</td>
                <td className="p-3">
                  <button
                    disabled={busyId === i.id}
                    onClick={() => act(i.id, () => toggleIngredient(i.id, !i.is_active))}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${i.is_active ? "bg-basil-500/15 text-basil-500" : "bg-ink-faint/15 text-ink-faint"}`}
                  >
                    {i.is_active ? "Yes" : "Hidden"}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => openEdit(i)} className="text-xs px-2 py-1 rounded-md bg-raised hover:bg-hover">
                      Edit
                    </button>
                    <button
                      disabled={busyId === i.id}
                      onClick={() => window.confirm(`Remove "${i.name}" from the master list? Restaurants that already imported it keep their copy.`) && act(i.id, () => deleteIngredient(i.id))}
                      className="text-xs px-2 py-1 rounded-md bg-crimson-500/15 text-crimson-500 hover:bg-crimson-500/25"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-faint">
                  No ingredients match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
