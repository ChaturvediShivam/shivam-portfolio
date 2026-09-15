"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { VBYB_BASE_PATH } from "@/lib/vbyb/config";

const TABS = [
  { href: VBYB_BASE_PATH, label: "Overview", exact: true },
  { href: `${VBYB_BASE_PATH}/orders`, label: "Orders" },
  { href: `${VBYB_BASE_PATH}/customers`, label: "Customers" },
  { href: `${VBYB_BASE_PATH}/validations`, label: "Validations" },
  { href: `${VBYB_BASE_PATH}/analytics`, label: "Analytics" },
  { href: `${VBYB_BASE_PATH}/settings`, label: "Settings" },
];

/** Section tabs for the Validate Before You Build module. */
export function ModuleTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Validate Before You Build sections" className="flex gap-1 overflow-x-auto border-b border-white/[0.06]">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active ? "border-white font-medium text-white" : "border-transparent text-slate-400 hover:text-white",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
