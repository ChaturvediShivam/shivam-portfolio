import Link from "next/link";
import { Inbox } from "lucide-react";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex text-slate-200">
      <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col justify-between py-6 px-4">
        <div>
          <div className="flex items-center gap-2 px-2 mb-8">
            <div className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center">
              <Inbox size={14} className="text-slate-300" />
            </div>
            <span className="text-sm font-semibold text-white">Inquiries</span>
          </div>

          <nav className="space-y-0.5">
            <Link
              href="/admin"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-200 bg-white/[0.06] font-medium"
            >
              Dashboard
            </Link>
          </nav>
        </div>

        <SignOutButton />
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
