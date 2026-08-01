import { ToastProvider } from "@/components/admin/ui";

export default function AutomationsLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
