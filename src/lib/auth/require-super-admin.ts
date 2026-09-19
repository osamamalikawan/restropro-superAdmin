import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Shared "is this a signed-in super admin" check, used by the console layout so it lives in
 *  one place instead of being hand-copied into every super-admin page/action. Returns null if
 *  anything doesn't check out — callers should redirect("/super-admin/login").
 *
 *  app/super-admin/actions.ts has its own local assertSuperAdmin() with the same query; that's
 *  left as-is for now to avoid touching working server actions in this pass, but it's the same
 *  check and could be pointed at this helper later. New action files (subscriptions, gallery,
 *  audit log) use requireSuperAdminUser() below instead of duplicating it again. */
export async function resolveSuperAdminContext() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", auth.user.id)
    .single();
  if (!superAdmin) return null;

  return { email: auth.user.email ?? "" };
}

/** Throw-based variant for server actions (mutations), mirroring actions.ts's assertSuperAdmin
 *  contract: returns the authenticated Supabase user (for actor_id on audit log rows) or throws. */
export async function requireSuperAdminUser(): Promise<User> {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data } = await supabase.from("super_admins").select("user_id").eq("user_id", auth.user.id).single();
  if (!data) throw new Error("Not a super admin");
  return auth.user;
}
