import { createAdminClient } from "@/lib/supabase/admin";

const ACTOR_TYPES = ["super_admin", "owner", "employee", "system"];

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ actor?: string; restaurant?: string }> }) {
  const { actor, restaurant } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("audit_logs")
    .select("id, restaurant_id, actor_type, actor_id, action, entity, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (actor) query = query.eq("actor_type", actor);
  if (restaurant) query = query.eq("restaurant_id", restaurant);

  const [{ data: logs }, { data: restaurants }] = await Promise.all([
    query,
    admin.from("restaurants").select("id, name").order("name", { ascending: true }),
  ]);

  const restaurantById = new Map((restaurants ?? []).map((r) => [r.id, r.name]));

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Audit Log</h1>
      <p className="text-ink-mid text-sm mb-6">Every action taken on a tenant, by who, and when.</p>

      <form method="GET" className="flex flex-wrap gap-3 mb-5">
        <select name="actor" defaultValue={actor ?? ""} className="rounded-md border border-line bg-canvas px-3 py-2 text-sm">
          <option value="">All actors</option>
          {ACTOR_TYPES.map((a) => (
            <option key={a} value={a}>
              {a.replace("_", " ")}
            </option>
          ))}
        </select>
        <select name="restaurant" defaultValue={restaurant ?? ""} className="rounded-md border border-line bg-canvas px-3 py-2 text-sm">
          <option value="">All restaurants</option>
          {(restaurants ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-raised hover:bg-hover text-xs font-semibold px-4 py-2">Filter</button>
        {(actor || restaurant) && (
          <a href="/super-admin/audit-log" className="text-xs text-ink-faint self-center hover:text-ink-strong">
            Clear filters
          </a>
        )}
      </form>

      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-ink-mid text-xs uppercase">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Actor</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Entity</th>
              <th className="text-left p-3">Restaurant</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="p-3 text-ink-faint text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                <td className="p-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-raised text-ink-mid">{l.actor_type.replace("_", " ")}</span>
                </td>
                <td className="p-3 font-medium">{l.action}</td>
                <td className="p-3 text-ink-mid text-xs">
                  {l.entity}
                  {l.entity_id ? <span className="text-ink-faint"> · {l.entity_id.slice(0, 8)}</span> : null}
                </td>
                <td className="p-3 text-ink-mid">{l.restaurant_id ? restaurantById.get(l.restaurant_id) ?? "—" : "—"}</td>
              </tr>
            ))}
            {(logs ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-faint">
                  No matching audit entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
