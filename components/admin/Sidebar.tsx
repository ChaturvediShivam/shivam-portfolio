"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "@/lib/admin/navigation";
import { SignOutButton } from "@/components/admin/SignOutButton";

export interface SidebarProps {
  /**
   * Ids of flag-gated items whose flag is off. Computed in the admin layout
   * (a Server Component) because feature flags are server-only — the sidebar is
   * told what to hide rather than reading the flags itself.
   */
  hiddenIds?: string[];
}

export function Sidebar({ hiddenIds }: SidebarProps = {}) {
  const pathname = usePathname();

  const hidden = new Set(hiddenIds ?? []);
  const items = adminNavigation.filter((item) => !hidden.has(item.id));

  // Section-aware highlight: match on exact path or a nested path
  // (e.g. /admin/companies/123 highlights "Companies"), choosing the item with
  // the longest matching href so "/admin" (Inquiries) never wins over a deeper
  // section.
  let activeId: string | undefined;
  let activeLen = -1;
  for (const item of items) {
    if (!item.enabled) continue;
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && item.href.length > activeLen) {
      activeId = item.id;
      activeLen = item.href.length;
    }
  }

  return (
    <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col justify-between py-6 px-4">
      <div>
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <span className="text-[10px] font-bold tracking-tight text-slate-200">CRM</span>
          </div>
          <span className="text-sm font-semibold text-white">Career CRM</span>
        </div>

        <nav className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;

            if (!item.enabled) {
              return (
                <div
                  key={item.id}
                  aria-disabled="true"
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-slate-600 cursor-not-allowed select-none"
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} />
                    {item.label}
                  </span>
                  <span className="text-[10px] font-medium tracking-wide uppercase text-slate-600 border border-white/10 rounded px-1.5 py-0.5">
                    Soon
                  </span>
                </div>
              );
            }

            const isActive = item.id === activeId;

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-200 bg-white/[0.06] font-medium"
                    : "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                }
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <SignOutButton />
    </aside>
  );
}
