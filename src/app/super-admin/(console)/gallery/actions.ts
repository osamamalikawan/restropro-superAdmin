"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdminUser } from "@/lib/auth/require-super-admin";

export async function listGalleryImages() {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data } = await admin
    .from("gallery_images")
    .select("id, title, url, category, tags, is_active")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function addGalleryImage(input: { title: string; url: string; category: string; tags: string[] }) {
  const actor = await requireSuperAdminUser();
  if (!input.title.trim()) throw new Error("Title is required");
  if (!input.url.trim()) throw new Error("Image URL is required");
  const admin = createAdminClient();
  await admin.from("gallery_images").insert({
    title: input.title.trim(),
    url: input.url.trim(),
    category: input.category.trim() || null,
    tags: input.tags,
    created_by: actor.id,
  });
  revalidatePath("/super-admin/gallery");
}

export async function toggleGalleryImage(id: string, isActive: boolean) {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  await admin.from("gallery_images").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/super-admin/gallery");
}

export async function removeGalleryImage(id: string) {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  await admin.from("gallery_images").delete().eq("id", id);
  revalidatePath("/super-admin/gallery");
}
