"use client";

import { motion } from "framer-motion";
import { CONTACT_INFO, SITE_CONFIG } from "@/constants";
import { Mail, Linkedin, MapPin } from "lucide-react";

export default function Contact() {
  return (
    <section id="contact" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            Get in Touch
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-consulting-navy">
            Contact
          </h2>
          <p className="text-lg text-consulting-slate leading-relaxed">
            Open to research, strategy, and consulting opportunities. Let&apos;s talk if my work fits what you need.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto grid gap-4"
        >
          <a
            href={`mailto:${CONTACT_INFO.email}`}
            className="flex items-center gap-4 p-5 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-consulting-royal/30 hover:shadow-md transition-all group"
          >
            <div className="p-2 rounded-lg bg-slate-100 text-consulting-royal group-hover:bg-consulting-royal/10 transition-colors">
              <Mail size={20} />
            </div>
            <div>
              <p className="text-xs font-mono uppercase text-slate-400">Email</p>
              <p className="text-consulting-navy font-medium">{CONTACT_INFO.email}</p>
            </div>
          </a>

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
