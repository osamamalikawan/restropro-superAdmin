import { createAdminClient } from "@/lib/supabase/admin";
import { listPlans, listRestaurantsForPicker } from "./actions";
import { PlansPanel } from "./plans-panel";
import { RestaurantSubscriptionPanel } from "./restaurant-sub-panel";

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ restaurant?: string }> }) {
  const { restaurant } = await searchParams;
  const admin = createAdminClient();

  const [plans, restaurants, { data: restaurantPlanCounts }] = await Promise.all([
    listPlans(),
    listRestaurantsForPicker(),
    admin.from("restaurants").select("plan_id"),
  ]);

  const restaurantCounts: Record<string, number> = {};
  for (const row of restaurantPlanCounts ?? []) {
    if (row.plan_id) restaurantCounts[row.plan_id] = (restaurantCounts[row.plan_id] ?? 0) + 1;
  }

  return (
    <main className="p-8 space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">Subscriptions</h1>
        <p className="text-ink-mid text-sm">Manage plans, and assign, extend, pause or resume any restaurant's subscription.</p>
      </div>

      <PlansPanel plans={plans} restaurantCounts={restaurantCounts} />

      <RestaurantSubscriptionPanel
        restaurants={restaurants}
        plans={plans.map((p) => ({ id: p.id, name: p.name }))}
        initialRestaurantId={restaurant}
      />
    </main>
  );
}
