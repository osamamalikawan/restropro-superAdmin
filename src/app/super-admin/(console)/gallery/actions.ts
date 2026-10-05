"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdminUser } from "@/lib/auth/require-super-admin";

const BUCKET = "gallery";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/** Server actions swallow thrown error messages in production builds, so these return
 *  { ok, error } instead of throwing — the client shows `error` directly. */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function listGalleryImages() {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data } = await admin
    .from("gallery_images")
    .select("id, title, url, category, tags, is_active")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Step 1 of an upload: validate the file's metadata and mint a one-shot signed upload URL.
 *  The browser then sends the file straight to Supabase Storage, so it never passes through
 *  a server action (which is capped at ~1 MB by default and ~4.5 MB on Vercel). */
export async function createGalleryUpload(input: {
  fileName: string;
  contentType: string;
  size: number;
}): Promise<Result<{ path: string; token: string; publicUrl: string }>> {
  try {
    await requireSuperAdminUser();
    if (!ALLOWED_TYPES.includes(input.contentType)) return { ok: false, error: "Only JPG, PNG, WebP, GIF or AVIF images are allowed" };
    if (input.size > MAX_BYTES) return { ok: false, error: "Image is larger than 5 MB" };

    const ext = (input.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return {
        ok: false,
        error: `${error?.message ?? "Could not start upload"} — make sure migration 0009 (the "gallery" storage bucket) has been applied`,
      };
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, path, token: data.token, publicUrl: pub.publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start upload" };
  }
}

export async function addGalleryImage(input: { title: string; url: string; category: string; tags: string[] }): Promise<Result> {
  try {
    const actor = await requireSuperAdminUser();
    if (!input.title.trim()) return { ok: false, error: "Title is required" };
    if (!input.url.trim()) return { ok: false, error: "Image is required" };
    const admin = createAdminClient();
    const { error } = await admin.from("gallery_images").insert({
      title: input.title.trim(),
      url: input.url.trim(),
      category: input.category.trim() || null,
      tags: input.tags,
      created_by: actor.id,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/super-admin/gallery");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add image" };
  }
}

export async function toggleGalleryImage(id: string, isActive: boolean): Promise<Result> {
  try {
    await requireSuperAdminUser();
    const admin = createAdminClient();
    const { error } = await admin.from("gallery_images").update({ is_active: isActive }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/super-admin/gallery");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update image" };
  }
}

export async function removeGalleryImage(id: string): Promise<Result> {
  try {
    await requireSuperAdminUser();
    const admin = createAdminClient();
    const { data: row } = await admin.from("gallery_images").select("url").eq("id", id).single();
    const { error } = await admin.from("gallery_images").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    // Also delete the stored file if this row pointed at our bucket (pasted external URLs are left alone).
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = row?.url?.indexOf(marker) ?? -1;
    if (row?.url && idx !== -1) {
      const objectPath = decodeURIComponent(row.url.slice(idx + marker.length).split("?")[0]);
      await admin.storage.from(BUCKET).remove([objectPath]);
    }
    revalidatePath("/super-admin/gallery");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove image" };
  }
}
