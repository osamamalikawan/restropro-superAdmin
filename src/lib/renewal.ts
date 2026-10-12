import type { SupabaseClient } from "@supabase/supabase-js";
import { graceUntil } from "@/lib/subscription";

/** New period end for a renewal. If the subscription already lapsed, count from today, not from
 *  the old end date (adding a month to a date three months ago would leave it expired). */
export function renewedPeriodEnd(currentEnd: string | Date, months: number, now: Date = new Date()): Date {
  const base = new Date(Math.max(new Date(currentEnd).getTime(), now.getTime()));
  base.setMonth(base.getMonth() + months);
  return base;
}

/** Writes a renewed (future) period onto a subscription and keeps the restaurant row in step.
 *  - cancelled / expired / grace subscriptions become active again (a paused one stays paused,
 *    resuming is its own action)
 *  - a restaurant the nightly sweep marked 'expired' comes back to 'active' (otherwise staff
 *    login is still refused even though the subscription is fine)
 *  - suspended / terminated restaurants are NOT touched: those need an explicit Reactivate */
export async function applyRenewal(
  admin: SupabaseClient,
  restaurantId: string,
  subscriptionId: string,
  newEnd: Date,
  opts: { startNow?: boolean } = {}
) {
  const { data: sub } = await admin.from("subscriptions").select("status").eq("id", subscriptionId).single();
  const now = new Date().toISOString();
  await admin
    .from("subscriptions")
    .update({
      current_period_end: newEnd.toISOString(),
      grace_until: graceUntil(newEnd).toISOString(),
      status: sub?.status === "paused" ? "paused" : "active",
      ...(opts.startNow ? { current_period_start: now } : {}),
      updated_at: now,
    })
    .eq("id", subscriptionId);
  await admin.from("restaurants").update({ status: "active" }).eq("id", restaurantId).eq("status", "expired");
}
