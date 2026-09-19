"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdminUser } from "@/lib/auth/require-super-admin";
import { graceUntil } from "@/lib/subscription";

export async function listPlans() {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscription_plans")
    .select("id, name, monthly_price, yearly_price, trial_days, max_users, features, is_active")
    .order("monthly_price", { ascending: true });
  return data ?? [];
}

export async function savePlan(input: {
  id?: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  trialDays: number;
  maxUsers: number | null;
  features: string[];
}) {
  await requireSuperAdminUser();
  if (!input.name.trim()) throw new Error("Plan name is required");
  const admin = createAdminClient();
  const row = {
    name: input.name.trim(),
    monthly_price: input.monthlyPrice,
    yearly_price: input.yearlyPrice,
    trial_days: input.trialDays,
    max_users: input.maxUsers,
    features: input.features,
  };
  if (input.id) {
    await admin.from("subscription_plans").update(row).eq("id", input.id);
  } else {
    await admin.from("subscription_plans").insert({ ...row, is_active: true });
  }
  revalidatePath("/super-admin/subscriptions");
}

export async function togglePlanActive(id: string, isActive: boolean) {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  await admin.from("subscription_plans").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/super-admin/subscriptions");
}

export async function listRestaurantsForPicker() {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data } = await admin.from("restaurants").select("id, name, status").order("name", { ascending: true });
  return data ?? [];
}

export async function getRestaurantSubscription(restaurantId: string) {
  await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("id, restaurant_id, plan_id, billing_cycle, current_period_start, current_period_end, grace_until, status")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Reassign plan / billing cycle, or hand-edit the period dates directly. Grace is always
 *  recomputed from whatever period end is set, so it never drifts out of sync (same rule the
 *  activation flow in app/super-admin/actions.ts uses). */
export async function saveSubscription(input: {
  restaurantId: string;
  subscriptionId: string;
  planId: string;
  billingCycle: "monthly" | "yearly";
  currentPeriodEnd: string; // yyyy-mm-dd from the date input
}) {
  const actor = await requireSuperAdminUser();
  const admin = createAdminClient();
  const periodEnd = new Date(input.currentPeriodEnd + "T00:00:00Z");

  await admin
    .from("subscriptions")
    .update({
      plan_id: input.planId,
      billing_cycle: input.billingCycle,
      current_period_end: periodEnd.toISOString(),
      grace_until: graceUntil(periodEnd).toISOString(),
    })
    .eq("id", input.subscriptionId);
  await admin.from("restaurants").update({ plan_id: input.planId, billing_cycle: input.billingCycle }).eq("id", input.restaurantId);

  await admin.from("audit_logs").insert({
    restaurant_id: input.restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "subscription_updated",
    entity: "subscription",
    entity_id: input.subscriptionId,
    new_value: { plan_id: input.planId, billing_cycle: input.billingCycle, current_period_end: periodEnd.toISOString() },
  });
  revalidatePath("/super-admin/subscriptions");
}

export async function extendSubscription(subscriptionId: string, restaurantId: string, months: number) {
  const actor = await requireSuperAdminUser();
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscriptions").select("current_period_end").eq("id", subscriptionId).single();
  if (!sub) throw new Error("Subscription not found");

  const newEnd = new Date(sub.current_period_end);
  newEnd.setMonth(newEnd.getMonth() + months);

  await admin
    .from("subscriptions")
    .update({ current_period_end: newEnd.toISOString(), grace_until: graceUntil(newEnd).toISOString() })
    .eq("id", subscriptionId);

  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action: "subscription_extended",
    entity: "subscription",
    entity_id: subscriptionId,
    new_value: { months, new_period_end: newEnd.toISOString() },
  });
  revalidatePath("/super-admin/subscriptions");
}

async function setSubscriptionStatus(subscriptionId: string, restaurantId: string, status: "paused" | "active", action: string) {
  const actor = await requireSuperAdminUser();
  const admin = createAdminClient();
  await admin.from("subscriptions").update({ status }).eq("id", subscriptionId);
  await admin.from("audit_logs").insert({
    restaurant_id: restaurantId,
    actor_type: "super_admin",
    actor_id: actor.id,
    action,
    entity: "subscription",
    entity_id: subscriptionId,
  });
  revalidatePath("/super-admin/subscriptions");
}

export async function pauseSubscription(subscriptionId: string, restaurantId: string) {
  return setSubscriptionStatus(subscriptionId, restaurantId, "paused", "subscription_paused");
}
export async function resumeSubscription(subscriptionId: string, restaurantId: string) {
  return setSubscriptionStatus(subscriptionId, restaurantId, "active", "subscription_resumed");
}
