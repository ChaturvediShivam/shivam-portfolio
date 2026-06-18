"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/Button";
import { FormInput } from "@/components/ui/FormInput";
import { CONTACT_INFO, SITE_CONFIG } from "@/constants";
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
    <section id="contact" className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        {/* Conversion headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 space-y-4"
        >
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            Get in Touch
          </span>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-consulting-navy">
            Need strategic intelligence, competitive insights, or due diligence support?
          </h2>
          <p className="text-lg text-consulting-slate leading-relaxed max-w-2xl mx-auto">
            Let&apos;s discuss how structured research can support better decisions.
          </p>
        </motion.div>

        {/* Contact form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-10"
        >
          {status === "success" ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-consulting-navy">Inquiry sent</h3>
              <p className="text-consulting-slate">
                Thank you for reaching out. I&apos;ll review your message and respond within 1–2 business days.
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
                <label className="text-sm font-semibold dark:text-slate-300">
                  Message *
                </label>
                <textarea
                  name="message"
                  required
                  rows={5}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell me about the research challenge, decision, or engagement you need support with."
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-consulting-royal transition-all dark:text-white resize-none"
                />
              </div>

              {/* Honeypot */}
              <div className="sr-only">
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
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={status === "loading"}
                className="w-full bg-consulting-navy hover:bg-consulting-navy/90 text-white h-14 text-base"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Sending inquiry...
                  </>
                ) : (
                  <>
                    <Send size={18} className="mr-2" />
                    Send an Inquiry
                  </>
                )}
              </Button>
            </form>
          )}
        </motion.div>

        {/* Secondary contact channels */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <a
            href={SITE_CONFIG.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-5 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-consulting-royal/30 hover:shadow-md transition-all group"
          >
            <div className="p-2 rounded-lg bg-slate-100 text-consulting-royal group-hover:bg-consulting-royal/10 transition-colors">
              <Linkedin size={20} />
            </div>
            <div>
              <p className="text-xs font-mono uppercase text-slate-400">LinkedIn</p>
              <p className="text-consulting-navy font-medium">linkedin.com/in/shivamchaturvedi96</p>
            </div>
          </a>

          <div className="flex items-center gap-4 p-5 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="p-2 rounded-lg bg-slate-100 text-consulting-royal">
              <MapPin size={20} />
            </div>
            <div>
              <p className="text-xs font-mono uppercase text-slate-400">Location</p>
              <p className="text-consulting-navy font-medium">{CONTACT_INFO.location}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
