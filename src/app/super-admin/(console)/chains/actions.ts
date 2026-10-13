"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdminUser } from "@/lib/auth/require-super-admin";

export type ChainRow = {
  id: string; name: string; ownerEmails: string[];
  branches: { restaurantId: string; name: string; branchName: string | null; status: string }[];
};

export async function listChains() {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const [{ data: chains }, { data: members }, { data: links }, { data: rests }] = await Promise.all([
    admin.from("chains").select("id, name").order("created_at", { ascending: false }),
    admin.from("chain_members").select("chain_id, user_id"),
    admin.from("chain_branches").select("chain_id, restaurant_id, branch_name, restaurants(name, status)"),
    admin.from("restaurants").select("id, name, city, status").order("name"),
  ]);
  const emailOf = new Map<string, string>();
  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    emailOf.set(m.user_id, data.user?.email ?? "unknown");
  }
  const linkedIds = new Set((links ?? []).map((l: any) => l.restaurant_id));
  const rows: ChainRow[] = (chains ?? []).map((c) => ({
    id: c.id, name: c.name,
    ownerEmails: (members ?? []).filter((m) => m.chain_id === c.id).map((m) => emailOf.get(m.user_id)!),
    branches: (links ?? []).filter((l: any) => l.chain_id === c.id).map((l: any) => ({
      restaurantId: l.restaurant_id, name: l.restaurants?.name ?? "?", branchName: l.branch_name, status: l.restaurants?.status ?? "?",
    })),
  }));
  const available = (rests ?? []).filter((r) => !linkedIds.has(r.id)).map((r) => ({ id: r.id, name: r.name, city: r.city as string | null, status: r.status as string }));
  return { chains: rows, available };
}

export async function createChain(input: { name: string; email: string; password: string }) {
  await requireSuperAdminUser();
  const name = input.name.trim(), email = input.email.trim().toLowerCase();
  if (!name || !email || input.password.length < 8) throw new Error("Name, email and a password of at least 8 characters are required.");
  const admin = createAdminClient();
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true });
  if (ue || !u.user) throw new Error(ue?.message || "Could not create the owner account.");
  const { data: chain, error: ce } = await admin.from("chains").insert({ name }).select("id").single();
  if (ce || !chain) { await admin.auth.admin.deleteUser(u.user.id); throw new Error(ce?.message || "Could not create the chain."); }
  const { error: me } = await admin.from("chain_members").insert({ chain_id: chain.id, user_id: u.user.id, role: "owner" });
  if (me) { await admin.from("chains").delete().eq("id", chain.id); await admin.auth.admin.deleteUser(u.user.id); throw new Error(me.message); }
  revalidatePath("/super-admin/chains");
}

export async function linkBranch(input: { chainId: string; restaurantId: string; branchName: string }) {
  const actor = await requireSuperAdminUser();
  const admin = createAdminClient();
  const { error } = await admin.from("chain_branches").insert({ chain_id: input.chainId, restaurant_id: input.restaurantId, branch_name: input.branchName.trim() || null });
  if (error) throw new Error(error.code === "23505" ? "That restaurant is already linked to a chain." : error.message);
  await admin.from("audit_logs").insert({ restaurant_id: input.restaurantId, actor_type: "super_admin", actor_id: actor.id, action: "branch_linked", entity: "chain", entity_id: input.chainId, new_value: { branch_name: input.branchName } });
  revalidatePath("/super-admin/chains");
}

export async function unlinkBranch(restaurantId: string) {
  const actor = await requireSuperAdminUser();
  const admin = createAdminClient();
  const { error } = await admin.from("chain_branches").delete().eq("restaurant_id", restaurantId);
  if (error) throw new Error(error.message);
  await admin.from("audit_logs").insert({ restaurant_id: restaurantId, actor_type: "super_admin", actor_id: actor.id, action: "branch_unlinked", entity: "chain", entity_id: restaurantId });
  revalidatePath("/super-admin/chains");
}

export async function resetChainOwnerPassword(chainId: string, password: string) {
  await requireSuperAdminUser();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const admin = createAdminClient();
  const { data: m } = await admin.from("chain_members").select("user_id").eq("chain_id", chainId).eq("role", "owner").limit(1).single();
  if (!m) throw new Error("Owner not found.");
  const { error } = await admin.auth.admin.updateUserById(m.user_id, { password });
  if (error) throw new Error(error.message);
}
