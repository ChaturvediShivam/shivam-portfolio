"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

type PageState = "checking" | "verified" | "invalid";

export default function AuthVerifiedPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("checking");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    async function decideDestination() {
      const response = await fetch("/api/auth/role");
      const { isAdmin } = await response.json();
      if (cancelled) return;
      if (isAdmin) {
        router.replace("/admin");
      } else {
        setState("verified");
      }
    }

    async function run() {
      // Supabase's confirmation link can arrive as an implicit-grant
      // fragment (#access_token=...&refresh_token=...) rather than a PKCE
      // ?code=. The app's browser client is hardcoded to flowType: "pkce"
      // (@supabase/ssr), so its own automatic URL detection throws on
      // exactly this format (confirmed directly in GoTrueClient's
      // _getSessionFromURL) — it never establishes a session and never
      // fires SIGNED_IN. setSession() doesn't care about flowType at all,
      // so parse the fragment ourselves and use it directly.
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        // Scrubbed only after the async call resolves — clearing it first
        // would race React Strict Mode's double effect invocation in dev,
        // where the second run reads an already-emptied hash.
        window.history.replaceState(null, "", window.location.pathname);
        if (cancelled) return;
        if (error) {
          setState("invalid");
          return;
        }
        await decideDestination();
        return;
      }

      if (hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }

      // No fragment — either the PKCE ?code= exchange already happened
      // server-side in /auth/callback (session established via cookies
      // before this page even loaded), or the link is invalid.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        await decideDestination();
      } else {
        setState("invalid");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] px-6">
      <div className="w-full max-w-sm text-center">
        {state === "checking" && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-8">
            <Loader2 size={14} className="animate-spin" />
            Verifying your email...
          </div>
        )}

        {state === "invalid" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 justify-center text-sm text-red-400 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-md">
              <AlertCircle size={14} className="shrink-0" />
              <span>This verification link is invalid or has expired.</span>
            </div>
            <a href="/admin/login" className="text-sm text-slate-400 hover:text-white transition-colors">
              Back to sign in
            </a>
          </div>
        )}

        {state === "verified" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 size={32} className="text-emerald-400" />
            <div>
              <p className="text-base font-semibold text-white">Email verified successfully</p>
              <p className="mt-1 text-sm text-slate-400">Your account is now active.</p>
            </div>
            <a
              href="/"
              className="mt-2 inline-flex items-center justify-center px-5 h-10 rounded-md bg-white text-[#0B0E14] text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              Continue
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
