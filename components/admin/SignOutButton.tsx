"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
    >
      <LogOut size={15} />
      Sign out
    </button>
  );
}
