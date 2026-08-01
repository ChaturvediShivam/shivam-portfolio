import { ToastProvider } from "@/components/admin/ui";

export default function ApprovalsLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
