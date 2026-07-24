"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}

export default function AdminSignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const targetEmail = email.trim();

    if (!EMAIL_REGEX.test(targetEmail)) {
      setError("Please provide a valid email address.");
      return;
    }
    const passwordError = getPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      // The account now exists but is unconfirmed. Send the confirmation
      // email from here, via the browser's own Supabase client — the same
      // client the eventual /auth/callback exchange runs through — so the
      // link it generates matches the flow type that client can process.
      const supabase = createBrowserSupabaseClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/auth/verified` },
      });

      if (resendError) {
        setError(
          resendError.status === 429
            ? "Too many requests. Please wait a minute before trying again."
            : "Your account was created, but we couldn't send the confirmation email. Please try again shortly."
        );
        setLoading(false);
        return;
      }

      setSubmitted(true);
      setLoading(false);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center mb-4">
            <UserPlus size={18} className="text-slate-300" />
          </div>
          <h1 className="text-lg font-semibold text-white">Create account</h1>
          <p className="text-sm text-slate-500 mt-1">Inquiry dashboard access only</p>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="flex items-center gap-2 justify-center text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 px-3 py-2 rounded-md">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>Check your email to confirm your account before signing in.</span>
            </div>
            <Link
              href="/admin/login"
              className="inline-block text-sm text-slate-400 hover:text-white transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="At least 8 characters"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 px-3 py-2 rounded-md"
              >
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
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>

            <Link
              href="/admin/login"
              className="block w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
