import { listChains } from "./actions";
import { ChainsClient } from "./chains-client";

export default async function ChainsPage() {
  const { chains, available } = await listChains();
  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Multi-branch accounts</h1>
      <p className="text-ink-mid text-sm mb-6">
        Create an owner login for a chain, then link its restaurants as branches. The owner uses the chain app to see all branches and manage inventory, stock and employees.
      </p>
      <ChainsClient chains={chains} available={available} />
    </main>
  );
}
