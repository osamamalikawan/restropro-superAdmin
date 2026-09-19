"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";

export function SuperAdminTopbar({ email }: { email: string }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  async function logout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/super-admin/login");
    router.refresh();
  }

  return (
    <header className="h-16 border-b border-line bg-canvas flex items-center justify-between px-6 shrink-0">
      <div className="font-display font-semibold text-ink-strong">Platform Console</div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <span className="text-sm text-ink-mid hidden sm:inline">{email}</span>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="text-xs text-ink-faint hover:text-crimson-400 border border-line rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {loggingOut ? "…" : "Log out"}
        </button>
      </div>
    </header>
  );
}
