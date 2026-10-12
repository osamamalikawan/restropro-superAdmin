"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdminUser } from "@/lib/auth/require-super-admin";

export async function listIngredients() {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ingredients")
    .select("id, name, category, item_type, unit, is_active")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveIngredient(input: {
  id?: string;
  name: string;
  category: string;
  itemType: "ready_made" | "self_made";
  unit: string;
}) {
  await requireSuperAdminUser();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const row = {
    name,
    category: input.category.trim() || "Other",
    item_type: input.itemType,
    unit: input.unit.trim() || "pcs",
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { error } = input.id
    ? await admin.from("ingredients").update(row).eq("id", input.id)
    : await admin.from("ingredients").insert(row);
  if (error) {
    // 23505 = unique_violation on lower(name)
    if (error.code === "23505") throw new Error(`"${name}" is already in the list.`);
    throw new Error(error.message);
  }
  revalidatePath("/super-admin/ingredients");
}

export async function toggleIngredient(id: string, isActive: boolean) {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { error } = await admin.from("ingredients").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/super-admin/ingredients");
}

/** Removing from the master list never touches inventory a restaurant already imported:
 *  those are independent copies in inventory_items. */
export async function deleteIngredient(id: string) {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { error } = await admin.from("ingredients").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/super-admin/ingredients");
}
