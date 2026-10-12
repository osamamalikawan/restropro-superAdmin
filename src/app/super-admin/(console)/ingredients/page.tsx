import { listIngredients } from "./actions";
import { IngredientsClient } from "./ingredients-client";

export default async function IngredientsPage() {
  const ingredients = await listIngredients();
  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Ingredients</h1>
      <p className="text-ink-mid text-sm mb-6">
        The master list restaurants import into their Inventory, all at once or one by one. Changes here never alter what a restaurant has already imported.
      </p>
      <IngredientsClient ingredients={ingredients} />
    </main>
  );
}
