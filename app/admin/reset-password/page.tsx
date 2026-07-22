"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";

type PageState = "checking" | "ready" | "invalid" | "success";

function getPasswordError(password: string, confirm: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  if (confirm && password !== confirm) return "Passwords do not match.";
  return null;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let settled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setState("ready");
      }
    });

    // PASSWORD_RECOVERY fires once, the moment a recovery session is first
    // picked up — whether that came from the callback's server-side code
    // exchange, or from Supabase's default access_token/refresh_token
    // fragment being auto-detected by this client on mount. If this
    // component mounts after that already happened, fall back to checking
    // for a plain authenticated session instead of waiting for an event
    // that already fired.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!settled && user) {
        settled = true;
        setState("ready");
      } else if (!settled) {
        setTimeout(() => {
          if (!settled) setState("invalid");
        }, 2000);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validationError = password || confirm ? getPasswordError(password, confirm) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = getPasswordError(password, confirm);
    if (err) {
      setError(err);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError("Failed to update password. Please try again.");
        setSubmitting(false);
        return;
      }

      // Recovery sessions shouldn't double as standing dashboard access —
      // sign out and require the new password to be used to sign back in.
      await supabase.auth.signOut();
      setState("success");
      setTimeout(() => router.push("/admin/login"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center mb-4">
            <KeyRound size={18} className="text-slate-300" />
          </div>
          <h1 className="text-lg font-semibold text-white">Reset password</h1>
        </div>

        {state === "checking" && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-8">
            <Loader2 size={14} className="animate-spin" />
            Verifying reset link...
          </div>
        )}

        {state === "invalid" && (
          <div className="space-y-4 text-center">
            <div className="flex items-center gap-2 justify-center text-sm text-red-400 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-md">
              <AlertCircle size={14} className="shrink-0" />
              <span>This reset link is invalid or has expired.</span>
            </div>
            <a href="/admin/login" className="text-sm text-slate-400 hover:text-white transition-colors">
              Back to sign in
            </a>
          </div>
        )}

        {state === "success" && (
          <div className="flex flex-col items-center gap-3 text-center py-6">
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="text-sm text-slate-300">
              Password updated. Redirecting you to sign in...
            </p>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>

            {(validationError || error) && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-md">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error || validationError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || Boolean(getPasswordError(password, confirm)) || !password}
              className="w-full h-10 rounded-md bg-white text-[#0B0E14] text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Updating...
                </>
              ) : (
                "Update password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
