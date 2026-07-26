import { Sidebar } from "@/components/admin/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex text-slate-200">
      <Sidebar />

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
