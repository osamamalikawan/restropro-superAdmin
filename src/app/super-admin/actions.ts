"use server";
import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { graceUntil } from "@/lib/subscription";
import { createHash } from "crypto";

function hashPin(pin: string) {
  return createHash("sha256").update(pin).digest("hex");
}

async function assertSuperAdmin() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { data } = await supabase.from("super_admins").select("user_id").eq("user_id", auth.user.id).single();
  if (!data) throw new Error("Not a super admin");
  return auth.user;
}

export async function listRestaurants() {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("restaurants")
    .select(
      "id, name, owner_name, email, phone, city, country, status, plan_id, billing_cycle, created_at, pending_admin_name, subscriptions(current_period_start, current_period_end, status)"
    )
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Full detail for the restaurant profile view: the row itself, its plan, and quick counts
 *  pulled straight from that tenant's own tables (scoped by restaurant_id, same as every
 *  restaurant-side query). */
export async function getRestaurantProfile(restaurantId: string) {
  await assertSuperAdmin();
  const admin = createAdminClient();

  const [{ data: restaurant }, { count: employeeCount }, { count: orderCount }, { count: productCount }] = await Promise.all([
    admin
      .from("restaurants")
      .select(
        "id, name, owner_name, email, phone, address, city, country, status, plan_id, billing_cycle, created_at, activated_at, subscription_plans(name), subscriptions(current_period_start, current_period_end, grace_until, status)"
      )
      .eq("id", restaurantId)
      .single(),
    admin.from("employees").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    admin.from("sales").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).neq("status", "cancelled"),
    admin.from("products").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
  ]);
  if (!restaurant) throw new Error("Restaurant not found");

  return {
    ...restaurant,
    employeeCount: employeeCount ?? 0,
    orderCount: orderCount ?? 0,
    productCount: productCount ?? 0,
  };
}

/** Super-admin-initiated onboarding. Deliberately mirrors app/signup/actions.ts's
 *  signupRestaurant() field-for-field (same owner-account creation, same pending_admin_pin_hash
 *  pattern), so a restaurant created here still goes through the normal Approve step and
 *  activateRestaurant() above works on it without any special-casing. */
export async function onboardRestaurant(formData: FormData) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();

  const restaurantName = String(formData.get("restaurantName") || "").trim();
  const ownerName = String(formData.get("ownerName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const phone = String(formData.get("phone") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const adminPin = String(formData.get("adminPin") || "").trim();
  const planId = String(formData.get("planId") || "");
  const billingCycle = String(formData.get("billingCycle") || "monthly");

  if (!restaurantName || !ownerName || !email || !password || !adminName || !adminPin) {
    throw new Error("Please fill in every field.");
  }
  if (!/^\d{4}$/.test(adminPin)) {
    throw new Error("Admin PIN must be exactly 4 digits.");
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !authUser.user) throw new Error(authError?.message || "Could not create the owner account.");

  const pendingPinHash = await hashPin(adminPin);
  const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const { data: newRestaurant, error: insertError } = await admin
    .from("restaurants")
    .insert({
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      name: restaurantName,
      owner_user_id: authUser.user.id,
      owner_name: ownerName,
      email,
      phone,
      city,
      status: "pending",
      plan_id: planId || null,
      billing_cycle: billingCycle,
      pending_admin_name: adminName,
      pending_admin_pin_hash: pendingPinHash,
    })
    .select("id")
    .single();
  if (insertError || !newRestaurant) {
    await admin.auth.admin.deleteUser(authUser.user.id); // don't leave an orphaned auth account
    throw new Error(insertError?.message || "Could not create restaurant");
  }

  await admin.from("audit_logs").insert({
    restaurant_id: newRestaurant.id,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_onboarded",
    entity: "restaurant",
    entity_id: newRestaurant.id,
    new_value: { name: restaurantName, email },
  });

  revalidatePath("/super-admin/restaurants");
}

/**
 * The core of the requested flow:
 *  1. restaurants.status -> 'active'
 *  2. Create the `employees` row for the admin, using the PIN captured at signup
 *  3. Clear the pending_admin_* columns (PIN hash should not linger once consumed)
 *  4. Create the first `subscriptions` row with a 3-day grace period after the period end
 *  5. Log an audit entry + send a welcome notification to that one restaurant
 */
export async function activateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();

  const { data: restaurant, error: fetchError } = await admin
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();
  if (fetchError || !restaurant) throw new Error("Restaurant not found");
  if (!restaurant.pending_admin_pin_hash) throw new Error("No pending admin PIN found for this restaurant");

  const now = new Date();
  const periodDays = restaurant.billing_cycle === "yearly" ? 365 : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  const { error: updateError } = await admin
    .from("restaurants")
    .update({
      status: "active",
      activated_at: now.toISOString(),
      pending_admin_name: null,
      pending_admin_pin_hash: null,
    })
    .eq("id", restaurantId);
  if (updateError) throw new Error(updateError.message);

  const { error: employeeError } = await admin.from("employees").insert({
    restaurant_id: restaurantId,
    name: restaurant.pending_admin_name,
    role: "admin",
    pin_hash: restaurant.pending_admin_pin_hash,
    status: "active",
  });
  if (employeeError) throw new Error(employeeError.message);

  await admin.from("subscriptions").insert({
    restaurant_id: restaurantId,
    plan_id: restaurant.plan_id,
    billing_cycle: restaurant.billing_cycle,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    grace_until: graceUntil(periodEnd).toISOString(),
    status: "active",
  });

  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_activated",
    entity: "restaurant",
    entity_id: restaurantId,
  });

  const { data: notif } = await admin
    .from("notifications")
    .insert({
      title: "Welcome to Restro Pro 🎉",
      body: "Your restaurant has been activated. Log in with your admin PIN to get started.",
      audience: "selected",
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (notif) {
    await admin.from("notification_recipients").insert({ notification_id: notif.id, restaurant_id: restaurantId });
  }

  revalidatePath("/super-admin/restaurants");
}

export async function suspendRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "suspended" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_suspended",
    entity: "restaurant",
    entity_id: restaurantId,
  });
  revalidatePath("/super-admin/restaurants");
}

export async function reactivateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "active" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_reactivated",
    entity: "restaurant",
    entity_id: restaurantId,
  });
  revalidatePath("/super-admin/restaurants");
}

export async function terminateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  await admin.from("restaurants").update({ status: "terminated" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_terminated",
    entity: "restaurant",
    entity_id: restaurantId,
  });
  revalidatePath("/super-admin/restaurants");
}