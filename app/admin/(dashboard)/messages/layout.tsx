import { ToastProvider } from "@/components/admin/ui";

/**
 * Scopes the Toast context to the Messages module only — deliberately not added
 * to the shared (dashboard) layout so the Inquiry module is untouched.
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
