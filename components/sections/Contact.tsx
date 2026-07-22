"use client";

import { useState, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/Button";
import { FormInput } from "@/components/ui/FormInput";
import { CONTACT_INFO, SITE_CONFIG } from "@/constants";
import { headingReveal } from "@/lib/motion";
import { Linkedin, MapPin, Send, Loader2, CheckCircle, AlertCircle } from "lucide-react";

const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;

interface FormState {
  name: string;
  email: string;
  organization: string;
  message: string;
  website: string; // honeypot
}

export default function Contact() {
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    organization: "",
    message: "",
    website: "",
  });
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const reduce = useReducedMotion();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;

    // Honeypot: if filled, silently reject
    if (form.website) {
      setStatus("success");
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setErrorMsg("Please fill in all required fields.");
      setStatus("error");
      return;
    }

    if (siteKey && !token) {
      setErrorMsg("Please complete the security check.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          organization: form.organization.trim(),
          message: form.message.trim(),
          token,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setStatus("success");
      setForm({ name: "", email: "", organization: "", message: "", website: "" });
      setToken(null);
      turnstileRef.current?.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send inquiry.");
      turnstileRef.current?.reset();
    }
  };

  return (
    <section id="contact" className="py-24 md:py-32 bg-[#F8FAFC] dark:bg-[#0B1120]">
      <div className="max-w-3xl mx-auto px-6">
        {/* Conversion headline */}
        <motion.div {...headingReveal(reduce)} className="text-center mb-12 space-y-4">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Get in Touch
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Need strategic intelligence, competitive insights, or due diligence support?
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Let&apos;s discuss how structured research can support better decisions.
          </p>
        </motion.div>

        {/* Contact form — a top accent bar gives it the same "considered document"
            quality as the Case Study cards, instead of a generic bordered box. */}
        <motion.div
          {...headingReveal(reduce, 0.1)}
          className="bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden"
        >
          <div aria-hidden="true" className="h-1 w-full bg-consulting-royal" />
          <div className="p-6 md:p-10">
          {status === "success" ? (
            <div role="status" className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto">
                <CheckCircle size={32} aria-hidden="true" />
              </div>
              <h3 className="text-2xl font-bold text-consulting-navy dark:text-[#F9FAFB]">Inquiry sent</h3>
              <p className="text-consulting-slate dark:text-[#CBD5E1]">
                Thank you. Your inquiry has been received. I will respond within 24 hours.
              </p>
              <Button
                variant="outline"
                size="md"
                onClick={() => setStatus("idle")}
                className="mt-4"
              >
                Send another inquiry
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInput
                  label="Name *"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Your name"
                />
                <FormInput
                  label="Email *"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@company.com"
                />
              </div>

              <FormInput
                label="Organization"
                name="organization"
                type="text"
                value={form.organization}
                onChange={handleChange}
                placeholder="Company or team (optional)"
              />

              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-semibold dark:text-slate-300">
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell me about the research challenge, decision, or engagement you need support with."
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-consulting-royal transition-all dark:text-white resize-none"
                />
              </div>

              {/* Honeypot — hidden from assistive tech too, so screen reader users never encounter it */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  value={form.website}
                  onChange={handleChange}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Turnstile */}
              {siteKey && (
                <div className="pt-2">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={siteKey}
                    onSuccess={setToken}
                    onError={() => {
                      setToken(null);
                      setStatus("error");
                      setErrorMsg("Security check failed. Please try again.");
                    }}
                    onExpire={() => setToken(null)}
                    options={{
                      theme: "auto",
                      size: "normal",
                    }}
                  />
                </div>
              )}

              {status === "error" && (
                <div role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={status === "loading"}
                className="group inline-flex items-center justify-center w-full px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120] bg-consulting-navy hover:bg-consulting-navy-light text-white shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" />
                    Sending inquiry...
                  </>
                ) : (
                  <>
                    <Send size={18} className="mr-2" aria-hidden="true" />
                    Send an Inquiry
                  </>
                )}
              </Button>
            </form>
          )}
          </div>
        </motion.div>

        {/* Secondary contact channels */}
        <motion.div
          {...headingReveal(reduce, 0.2)}
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <a
            href={SITE_CONFIG.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-5 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 hover:border-consulting-royal/40 hover:shadow-[0_16px_32px_-20px_rgba(10,25,47,0.18)] dark:hover:shadow-[0_16px_32px_-20px_rgba(0,0,0,0.55)] hover:-translate-y-0.5 transition-all duration-300 ease-calm group"
          >
            <div className="flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 dark:border-white/10 bg-consulting-royal/[0.06] dark:bg-white/[0.03] text-consulting-royal group-hover:bg-consulting-royal/10 transition-colors flex-shrink-0">
              <Linkedin size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono uppercase text-slate-600 dark:text-slate-400">LinkedIn</p>
              <p className="text-consulting-navy dark:text-[#F9FAFB] font-medium break-words">
                linkedin.com/in/<wbr />shivamchaturvedi96
                <span className="sr-only"> (opens in a new tab)</span>
              </p>
            </div>
          </a>

          <div className="flex items-center gap-4 p-5 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
            <div className="flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 dark:border-white/10 bg-consulting-royal/[0.06] dark:bg-white/[0.03] text-consulting-royal flex-shrink-0">
              <MapPin size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono uppercase text-slate-600 dark:text-slate-400">Location</p>
              <p className="text-consulting-navy dark:text-[#F9FAFB] font-medium break-words">{CONTACT_INFO.location}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
