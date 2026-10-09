import { ToastProvider } from "@/components/admin/ui";
import { ModuleTabs } from "@/components/admin/vbyb/ModuleTabs";
import { requireVbybAdminPage } from "@/lib/vbyb/db";

export const metadata = { title: "Validate Before You Build" };

/**
 * Module shell. Returns 404 when FEATURE_VBYB is off or the caller is not the
 * allowlisted admin — middleware already guards /admin/*, this re-checks on the
 * server. Toasts are scoped to the module, as in the other admin modules.
 */
export default async function ValidateBeforeYouBuildLayout({ children }: { children: React.ReactNode }) {
  await requireVbybAdminPage();

  return (
    <ToastProvider>
      <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-10">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Product · Founding version</p>
            <h1 className="mt-1 text-xl font-semibold text-white">Validate Before You Build</h1>
          </div>
          <ModuleTabs />
        </div>
        {children}
      </div>
    </ToastProvider>
  );
}
