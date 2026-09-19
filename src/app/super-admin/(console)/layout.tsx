import { redirect } from "next/navigation";
import { resolveSuperAdminContext } from "@/lib/auth/require-super-admin";
import { SuperAdminSidebar } from "./sidebar";
import { SuperAdminTopbar } from "./topbar";

/**
 * Wraps every authenticated /super-admin/* page (dashboard, notifications, and whatever gets
 * added next — subscriptions, master gallery, audit log) with a persistent sidebar + topbar,
 * the same fix already applied to app/(restaurant)/dashboard/layout.tsx. Before this, each
 * super-admin page was a bare standalone <main> with no shared nav between them.
 *
 * This lives at app/super-admin/(console)/layout.tsx rather than app/super-admin/layout.tsx
 * specifically so /super-admin/login stays OUTSIDE it — a layout at the parent level would
 * wrap the login page too and redirect-loop an unauthenticated visitor trying to reach it.
 * (Route groups in parentheses don't affect the URL, so /super-admin/dashboard etc. are
 * unchanged.)
 */
export default async function SuperAdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveSuperAdminContext();
  if (!ctx) redirect("/super-admin/login");

  return (
    <div className="min-h-screen bg-canvas text-ink-strong flex">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <SuperAdminTopbar email={ctx.email} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
