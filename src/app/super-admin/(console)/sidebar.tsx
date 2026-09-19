"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, CreditCard, Image as ImageIcon, ScrollText, Bell, Settings as SettingsIcon, type LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/restaurants", label: "Restaurants", icon: Building2 },
  { href: "/super-admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/super-admin/gallery", label: "Master Gallery", icon: ImageIcon },
  { href: "/super-admin/audit-log", label: "Audit Log", icon: ScrollText },
  { href: "/super-admin/notifications", label: "Notifications", icon: Bell },
  { href: "/super-admin/settings", label: "Settings", icon: SettingsIcon },
];

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-line bg-surface p-4 hidden md:flex md:flex-col overflow-y-auto">
      <div className="mb-6 px-2">
        <div className="font-display text-lg font-semibold text-ink-strong">Restro Pro</div>
        <div className="text-[10px] text-ink-faint uppercase tracking-wide">Super Admin</div>
      </div>
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold px-2 mb-2">Platform</div>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm mb-0.5 transition-colors ${
                active ? "bg-chili-500/15 text-chili-400 font-semibold" : "text-ink-mid hover:bg-hover hover:text-ink-strong"
              }`}
            >
              <Icon size={16} className={active ? "opacity-100" : "opacity-70"} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
