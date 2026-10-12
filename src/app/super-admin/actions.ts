"use server";
import { revalidatePath } from "next/cache";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus, graceUntil, isUsable } from "@/lib/subscription";
import { applyRenewal } from "@/lib/renewal";
import { hashPin } from "@/lib/auth/pin"; // bcrypt, the same hash the restaurant app's PIN login verifies

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

/** Everything the restaurant profile needs: the row, its plan and subscription, headcount, last
 *  activity, and a live row count for every "delete" option so the admin can see what a reset
 *  would actually remove. All scoped by restaurant_id. */
export async function getRestaurantProfile(restaurantId: string) {
  await assertSuperAdmin();
  const admin = createAdminClient();

  const count = async (table: string, narrow?: (q: any) => any) => {
    let q: any = admin.from(table).select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
    if (narrow) q = narrow(q);
    const { count: n } = await q;
    return (n ?? 0) as number;
  };
  const latest = async (table: string, col: string, narrow?: (q: any) => any) => {
    let q: any = admin.from(table).select(col).eq("restaurant_id", restaurantId).order(col, { ascending: false }).limit(1);
    if (narrow) q = narrow(q);
    const { data } = await q;
    return ((data as any)?.[0]?.[col] ?? null) as string | null;
  };

  const [
    { data: restaurant },
    employeesTotal,
    employeesActive,
    sales,
    ordersLogged,
    accounts,
    customers,
    menuItems,
    menuCategories,
    inventory,
    suppliers,
    expenses,
    recurring,
    shifts,
    attendance,
    tables,
    areas,
    lastSale,
    lastShift,
    lastAttendance,
    lastStaffAction,
    lastExpense,
  ] = await Promise.all([
    admin
      .from("restaurants")
      .select(
        "id, name, owner_name, email, phone, address, city, country, status, plan_id, billing_cycle, created_at, activated_at, subscription_plans(name), subscriptions(current_period_start, current_period_end, grace_until, status)"
      )
      .eq("id", restaurantId)
      .single(),
    count("employees"),
    count("employees", (q) => q.eq("status", "active")),
    count("sales"),
    count("sales", (q) => q.neq("status", "cancelled")),
    count("accounts"),
    count("customers"),
    count("products", (q) => q.is("deleted_at", null)),
    count("menu_categories"),
    count("inventory_items"),
    count("suppliers"),
    count("expenses"),
    count("recurring_expenses"),
    count("staff_shifts"),
    count("attendance_records"),
    count("tables"),
    count("delivery_areas"),
    latest("sales", "created_at"),
    latest("staff_shifts", "clock_in_at"),
    latest("attendance_records", "clock_in_at"),
    latest("audit_logs", "created_at", (q) => q.neq("actor_type", "super_admin")),
    latest("expenses", "created_at"),
  ]);
  if (!restaurant) throw new Error("Restaurant not found");

  const candidates: { at: string | null; source: string }[] = [
    { at: lastSale, source: "Sale" },
    { at: lastShift, source: "Shift clock-in" },
    { at: lastAttendance, source: "Attendance" },
    { at: lastStaffAction, source: "Staff action" },
    { at: lastExpense, source: "Expense" },
  ];
  const lastActivity = candidates
    .filter((c) => c.at)
    .sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime())[0] ?? null;

  return {
    ...restaurant,
    employeesTotal,
    employeesActive,
    ordersLogged,
    menuItems,
    inventoryItems: inventory,
    lastActivityAt: lastActivity?.at ?? null,
    lastActivitySource: lastActivity?.source ?? null,
    // what each delete option would remove (employees: everyone except the main admin)
    scopeCounts: {
      sales,
      accounts,
      customers,
      menu: menuItems + menuCategories,
      inventory,
      suppliers,
      expenses: expenses + recurring,
      shifts: shifts + attendance,
      tables_delivery: tables + areas,
      employees: Math.max(employeesTotal - 1, 0),
    },
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

/** Brings a suspended, terminated or expired restaurant back. Flipping restaurants.status alone
 *  is not enough: staff login also checks the subscription, and the nightly sweep puts a lapsed
 *  restaurant straight back to 'expired'. So if the subscription is cancelled or past its grace
 *  period, a fresh billing period starts today. A subscription that is still valid is left alone. */
export async function reactivateRestaurant(restaurantId: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, status, plan_id, billing_cycle")
    .eq("id", restaurantId)
    .single();
  if (!restaurant) throw new Error("Restaurant not found");
  if (restaurant.status === "pending") throw new Error("This restaurant is still pending. Use Approve instead.");

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, current_period_end, grace_until, status, billing_cycle")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  let renewed = false;
  let newPeriodEnd: string | null = sub?.current_period_end ?? null;

  if (!sub) {
    if (!restaurant.plan_id) throw new Error("This restaurant has no plan. Assign one on the Subscriptions page first.");
    const end = new Date(now.getTime() + (restaurant.billing_cycle === "yearly" ? 365 : 30) * 86400000);
    await admin.from("subscriptions").insert({
      restaurant_id: restaurantId,
      plan_id: restaurant.plan_id,
      billing_cycle: restaurant.billing_cycle,
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      grace_until: graceUntil(end).toISOString(),
      status: "active",
    });
    renewed = true;
    newPeriodEnd = end.toISOString();
  } else {
    // Treat a paused subscription as resumed, then see whether the dates still cover today.
    const probe = { ...sub, status: sub.status === "paused" ? ("active" as const) : sub.status };
    if (isUsable(computeStatus(probe as any, now))) {
      if (sub.status === "paused") await admin.from("subscriptions").update({ status: "active" }).eq("id", sub.id);
    } else {
      const end = new Date(now.getTime() + (sub.billing_cycle === "yearly" ? 365 : 30) * 86400000);
      await applyRenewal(admin, restaurantId, sub.id, end, { startNow: true });
      renewed = true;
      newPeriodEnd = end.toISOString();
    }
  }

  await admin.from("restaurants").update({ status: "active" }).eq("id", restaurantId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "restaurant_reactivated",
    entity: "restaurant",
    entity_id: restaurantId,
    old_value: { status: restaurant.status },
    new_value: { status: "active", subscription_renewed: renewed, period_end: newPeriodEnd },
  });
  revalidatePath("/super-admin/restaurants");
  revalidatePath("/super-admin/subscriptions");
  return { renewed, newPeriodEnd };
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

const RESET_SCOPES = ["everything", "sales", "accounts", "customers", "menu", "inventory", "suppliers", "expenses", "shifts", "tables_delivery", "employees"];

/** Deletes tenant data in one database transaction (see migration 0028). The main admin employee,
 *  the restaurant itself, its subscription, settings, audit log and tenant_payments are never
 *  touched. A full reset needs the restaurant's name typed back as confirmation. */
export async function resetRestaurantData(restaurantId: string, scopes: string[], confirmName?: string) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();

  if (!scopes.length || scopes.some((s) => !RESET_SCOPES.includes(s))) throw new Error("Choose what to delete.");
  const { data: restaurant } = await admin.from("restaurants").select("name").eq("id", restaurantId).single();
  if (!restaurant) throw new Error("Restaurant not found");
  if (scopes.includes("everything") && (confirmName ?? "").trim() !== restaurant.name) {
    throw new Error("Type the restaurant's name exactly to confirm a full reset.");
  }

  const { data, error } = await admin.rpc("admin_reset_restaurant_data", { p_restaurant_id: restaurantId, p_scopes: scopes });
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: scopes.includes("everything") ? "restaurant_data_reset" : "restaurant_data_deleted",
    entity: "restaurant",
    entity_id: restaurantId,
    new_value: { scopes, deleted: data },
  });
  revalidatePath("/super-admin/restaurants");
  return (data ?? {}) as Record<string, number>;
}

/** Payment history for one restaurant (money the restaurant paid the platform). Kept forever. */
export async function listTenantPayments(restaurantId: string) {
  await assertSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_payments")
    .select("id, amount, method, reference, note, billing_cycle, period_start, period_end, paid_at")
    .eq("restaurant_id", restaurantId)
    .order("paid_at", { ascending: false })
    .limit(100);
  const payments = data ?? [];
  const total = payments.reduce((sum, p: any) => sum + Number(p.amount), 0);
  return { payments, total };
}

/** Records a payment from a restaurant and, optionally, extends its subscription by one billing
 *  period in the same step. The extension counts from today if the subscription had lapsed. */
export async function recordTenantPayment(input: {
  restaurantId: string;
  amount: number;
  method: string;
  reference?: string;
  note?: string;
  paidAt?: string; // yyyy-mm-dd
  extendSubscription: boolean;
}) {
  const actor = await assertSuperAdmin();
  const admin = createAdminClient();
  if (!(input.amount > 0)) throw new Error("Enter an amount greater than zero.");

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, plan_id, billing_cycle")
    .eq("id", input.restaurantId)
    .single();
  if (!restaurant) throw new Error("Restaurant not found");

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (input.extendSubscription) {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, current_period_end, billing_cycle")
      .eq("restaurant_id", input.restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) throw new Error("This restaurant has no subscription to extend. Untick 'Extend subscription' or approve it first.");
    const months = sub.billing_cycle === "yearly" ? 12 : 1;
    const base = new Date(Math.max(new Date(sub.current_period_end).getTime(), Date.now()));
    const end = new Date(base);
    end.setMonth(end.getMonth() + months);
    await applyRenewal(admin, input.restaurantId, sub.id, end);
    periodStart = base.toISOString();
    periodEnd = end.toISOString();
  }

  const { error } = await admin.from("tenant_payments").insert({
    restaurant_id: input.restaurantId,
    amount: input.amount,
    method: input.method || "cash",
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
    plan_id: restaurant.plan_id,
    billing_cycle: restaurant.billing_cycle,
    period_start: periodStart,
    period_end: periodEnd,
    paid_at: input.paidAt ? new Date(input.paidAt + "T12:00:00Z").toISOString() : new Date().toISOString(),
    recorded_by: actor.id,
  });
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    restaurant_id: input.restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "tenant_payment_recorded",
    entity: "tenant_payment",
    new_value: { amount: input.amount, method: input.method, extended_to: periodEnd },
  });
  revalidatePath("/super-admin/restaurants");
  revalidatePath("/super-admin/subscriptions");
}
