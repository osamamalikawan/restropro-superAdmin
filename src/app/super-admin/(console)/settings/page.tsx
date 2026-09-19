import { resolveSuperAdminContext } from "@/lib/auth/require-super-admin";
import { PasswordForm } from "./password-form";

export default async function SuperAdminSettingsPage() {
  const ctx = await resolveSuperAdminContext(); // layout already guarantees this is non-null

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-ink-mid text-sm mb-6">Signed in as {ctx?.email}.</p>
      <PasswordForm />
    </main>
  );
}
