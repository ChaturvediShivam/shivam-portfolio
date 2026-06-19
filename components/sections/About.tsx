"use client";

import { motion } from "framer-motion";
import { ABOUT_CONTENT } from "@/constants";
import { ArrowRight } from "lucide-react";

export default function About() {
  return (
    <section className="py-24 bg-[#F8FAFC] dark:bg-[#0B1120] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">

          {/* Narrative Column (70%) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="lg:col-span-8 space-y-12"
          >
            <div className="space-y-4">
              <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
                The Evolution
              </span>
              <h2 className="text-4xl font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB]">
                {ABOUT_CONTENT.title}
              </h2>
            </div>

            <div className="space-y-12">
              {ABOUT_CONTENT.narrative.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.2 }}
                  className="relative pl-8 border-l-2 border-slate-100 dark:border-slate-700 hover:border-consulting-royal transition-colors group"
                >
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-600 group-hover:border-consulting-royal transition-colors" />
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-consulting-navy dark:text-[#F9FAFB]">{item.era}</span>
                      <span className="text-xs font-mono text-consulting-slate dark:text-[#CBD5E1] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.role}</span>
                    </div>
                    <p className="text-lg text-consulting-slate dark:text-[#CBD5E1] leading-relaxed">
                      {item.text}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="p-6 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-700/50 italic text-consulting-slate dark:text-[#CBD5E1] leading-relaxed shadow-sm">
              &ldquo;{ABOUT_CONTENT.philosophy}&rdquo;
            </div>
          </motion.div>

          {/* Visual Column (30%) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="lg:col-span-4 relative"
          >
            <div className="relative z-10 aspect-[4/5] rounded-2xl overflow-hidden border-8 border-white dark:border-slate-700/50 shadow-2xl">
              <img
                src="/profile.jpg"
                alt="Shivam Chaturvedi Professional Headshot"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-consulting-navy/20 to-transparent" />
            </div>

            <div className="absolute -bottom-6 -right-6 w-full h-full bg-slate-100 dark:bg-slate-800 rounded-2xl -z-10" />
            <div className="absolute -top-6 -left-6 w-32 h-32 bg-consulting-royal/10 rounded-full blur-3xl -z-10" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
