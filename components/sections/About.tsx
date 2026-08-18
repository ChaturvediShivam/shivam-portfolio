"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ABOUT_CONTENT } from "@/constants";
import { headingReveal, itemReveal } from "@/lib/motion";

export default function About() {
  const reduce = useReducedMotion();

  return (
    <section id="about" className="py-24 md:py-32 bg-[#FBF8F2] dark:bg-[#111827] overflow-hidden">
      <div className="max-w-4xl mx-auto px-6 text-center">
        {/* The manifesto — philosophy is the point, not the career chronology beneath it. */}
        <motion.div {...headingReveal(reduce)} className="space-y-6">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            The Evolution
          </span>
          <h2 className="text-lg md:text-xl font-semibold tracking-[-0.01em] text-consulting-slate dark:text-[#CBD5E1]">
            {ABOUT_CONTENT.title}
          </h2>
          <p className="mt-2 text-4xl md:text-[3.25rem] font-medium tracking-[-0.025em] leading-[1.18] text-consulting-navy dark:text-[#F9FAFB] text-balance">
            &ldquo;{ABOUT_CONTENT.philosophy}&rdquo;
          </p>
        </motion.div>

        {/* Career grounding — compact, secondary, no timeline scaffolding. Set apart from the
            quote above with more room than before, so the two read as distinct moments:
            a luxury statement, then a quieter, essay-paced account beneath it. */}
        <div className="mt-20 md:mt-28 grid grid-cols-1 md:grid-cols-3 gap-10 text-left">
          {ABOUT_CONTENT.narrative.map((item, idx) => (
            <motion.div
              key={idx}
              {...itemReveal(reduce, idx * 0.1)}
              className="space-y-2 pt-7 border-t border-slate-200 dark:border-white/10"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-consulting-navy dark:text-[#F9FAFB]">{item.era}</span>
                <span className="text-[10px] font-mono uppercase text-consulting-slate dark:text-[#CBD5E1] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {item.role}
                </span>
              </div>
              <p className="text-sm text-consulting-slate dark:text-slate-400 leading-relaxed">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
