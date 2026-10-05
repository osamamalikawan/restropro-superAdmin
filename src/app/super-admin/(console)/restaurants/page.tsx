import { createAdminClient } from "@/lib/supabase/admin";
import { listRestaurants } from "@/app/super-admin/actions";
import { RestaurantsClient } from "./restaurants-client";

export default async function RestaurantsPage() {
  const admin = createAdminClient();
  const [restaurants, { data: plans }] = await Promise.all([
    listRestaurants(),
    admin.from("subscription_plans").select("id, name, monthly_price").eq("is_active", true).order("monthly_price", { ascending: true }),
  ]);

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Restaurants</h1>
      <p className="text-ink-mid text-sm mb-6">Approve signups, manage tenant lifecycle, and open a restaurant's subscription.</p>
      <RestaurantsClient restaurants={restaurants as any} plans={plans ?? []} />
    </main>
  );
}