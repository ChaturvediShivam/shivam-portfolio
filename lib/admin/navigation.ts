import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  Building2,
  Users,
  MessageSquare,
  ListChecks,
  Calendar,
  BarChart3,
  Settings,
  Briefcase,
} from "lucide-react";

/**
 * A single admin sidebar navigation entry.
 *
 * The sidebar renders entirely from the `adminNavigation` array below — there
 * are no hardcoded items in the component. To add, remove, reorder, rename, or
 * enable a module, edit this file only.
 */
export interface NavItem {
  /** Stable identifier, also used as the React key. */
  id: string;
  /** Human-readable label shown in the sidebar. */
  label: string;
  /** Route the item links to when enabled. */
  href: string;
  /** lucide-react icon component rendered alongside the label. */
  icon: LucideIcon;
  /**
   * When false the item is shown but rendered as a non-interactive
   * "Coming Soon" placeholder — it never navigates.
   */
  enabled: boolean;
}

/**
 * The admin navigation, top to bottom.
 *
 * Phase 1 note: `Dashboard` and `Inquiries` both resolve to `/admin`, which is
 * the current combined dashboard/inquiries view. Splitting them into distinct
 * pages is Phase 2 work and intentionally out of scope here.
 */
export const adminNavigation: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, enabled: true },
  { id: "inquiries", label: "Inquiries", href: "/admin", icon: Inbox, enabled: true },
  { id: "opportunities", label: "Opportunities", href: "/admin/opportunities", icon: Briefcase, enabled: true },
  { id: "companies", label: "Companies", href: "/admin/companies", icon: Building2, enabled: true },
  { id: "contacts", label: "Contacts", href: "/admin/contacts", icon: Users, enabled: true },
  { id: "messages", label: "Messages", href: "/admin/messages", icon: MessageSquare, enabled: true },
  { id: "tasks", label: "Tasks", href: "/admin/tasks", icon: ListChecks, enabled: true },
  { id: "calendar", label: "Calendar", href: "/admin/calendar", icon: Calendar, enabled: false },
  { id: "analytics", label: "Analytics", href: "/admin/analytics", icon: BarChart3, enabled: true },
  { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings, enabled: true },
];
