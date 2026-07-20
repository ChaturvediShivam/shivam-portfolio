"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ABOUT_CONTENT } from "@/constants";
import { headingReveal, itemReveal, imageReveal } from "@/lib/motion";

export default function About() {
  const reduce = useReducedMotion();

  return (
    <section className="py-24 md:py-32 bg-[#F8FAFC] dark:bg-[#0B1120] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">

          {/* Narrative Column (70%) */}
          <motion.div
            {...headingReveal(reduce)}
            className="lg:col-span-8 space-y-12"
          >
            <div className="space-y-4">
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal font-semibold">
                The Evolution
              </span>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
                {ABOUT_CONTENT.title}
              </h2>
            </div>

            <div className="space-y-12">
              {ABOUT_CONTENT.narrative.map((item, idx) => (
                <motion.div
                  key={idx}
                  {...itemReveal(reduce, idx * 0.1)}
                  className="relative pl-8 border-l-2 border-slate-200 dark:border-white/10 hover:border-consulting-royal transition-colors ease-calm group"
                >
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-white/15 group-hover:border-consulting-royal transition-colors" />
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

            <div className="p-6 bg-white dark:bg-white/[0.02] rounded-xl border border-slate-200 dark:border-white/10 italic text-consulting-slate dark:text-slate-300 leading-relaxed">
              &ldquo;{ABOUT_CONTENT.philosophy}&rdquo;
            </div>
          </motion.div>

          {/* Visual Column (30%) */}
          <motion.div
            {...imageReveal(reduce, 0.1)}
            className="lg:col-span-4 relative"
          >
            <div className="relative w-full max-w-sm aspect-[4/5]">
              <div className="relative w-full h-full rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shadow-[0_24px_48px_-24px_rgba(10,25,47,0.28)] dark:shadow-[0_24px_52px_-24px_rgba(0,0,0,0.6)]">
                <img
                  src="/profile.jpg"
                  alt="Shivam Chaturvedi Professional Headshot"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
