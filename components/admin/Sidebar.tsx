"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox } from "lucide-react";
import { adminNavigation } from "@/lib/admin/navigation";
import { SignOutButton } from "@/components/admin/SignOutButton";

export function Sidebar() {
  const pathname = usePathname();

  // Highlight the first enabled item whose href matches the current path. Using
  // the first match keeps a single item active even when two enabled entries
  // share a route (Dashboard and Inquiries both point at /admin in Phase 1).
  const activeId = adminNavigation.find(
    (item) => item.enabled && pathname === item.href,
  )?.id;

  return (
    <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col justify-between py-6 px-4">
      <div>
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <Inbox size={14} className="text-slate-300" />
          </div>
          <span className="text-sm font-semibold text-white">Inquiries</span>
        </div>

        <nav className="space-y-0.5">
          {adminNavigation.map((item) => {
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
