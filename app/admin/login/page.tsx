"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, Loader2, Lock, KeyRound } from "lucide-react";

type Mode = "signin" | "forgot";

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(
          signInError.code === "email_not_confirmed"
            ? "Please confirm your email before signing in. Check your inbox for the confirmation link."
            : "Invalid email or password."
        );
        setLoading(false);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const targetEmail = email.trim();
    const redirectTo = `${window.location.origin}/auth/callback`;

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, { redirectTo });

      if (resetError) {
        // Supabase's /recover endpoint already returns a clean success for
        // both existing and non-existent emails by design — it never signals
        // user existence through error vs. success. So a real error here is
        // an infrastructure failure (rate limit, network, etc.), not a
        // privacy leak, and is safe — and important — to surface directly
        // instead of masking it behind a fake success message.
        setError(
          resetError.status === 429
            ? "Too many requests. Please wait a minute before trying again."
            : "Something went wrong sending the reset email. Please try again."
        );
        setLoading(false);
        return;
      }

      setResetSent(true);
      setLoading(false);
    } catch {
      setError("Something went wrong sending the reset email. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center mb-4">
            {mode === "signin" ? (
              <Lock size={18} className="text-slate-300" />
            ) : (
              <KeyRound size={18} className="text-slate-300" />
            )}
          </div>
          <h1 className="text-lg font-semibold text-white">
            {mode === "signin" ? "Admin sign in" : "Reset password"}
          </h1>
          {mode === "signin" && (
            <p className="text-sm text-slate-500 mt-1">Inquiry dashboard access only</p>
          )}
        </div>

        {mode === "signin" ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400" htmlFor="password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
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

            {error && (
              <div role="alert" className="flex items-center gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-md">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md bg-white text-[#0B0E14] text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>

            <Link
              href="/admin/signup"
              className="block w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Need an account? Create one
            </Link>
          </form>
        ) : resetSent ? (
          <div className="space-y-4 text-center">
            <div className="flex items-center gap-2 justify-center text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 px-3 py-2 rounded-md">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>If that email has an account, a reset link is on its way.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setResetSent(false);
              }}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-md">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md bg-white text-[#0B0E14] text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                "Send reset link"
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
