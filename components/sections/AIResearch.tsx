"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RESEARCH_OS } from "@/constants";
import { headingReveal, itemReveal, gridDelay } from "@/lib/motion";
import {
  Cpu,
  Zap,
  Layers,
  Search,
  FileText,
  CheckCircle,
  GitBranch,
  Target,
  ShieldCheck,
} from "lucide-react";

// Existing icons preserved — color unified to monochrome for an executive, non-colorful system.
const stepIcons = [
  Target,
  Search,
  GitBranch,
  Layers,
  ShieldCheck,
  Zap,
  FileText,
  CheckCircle,
];

export default function AIResearch() {
  const reduce = useReducedMotion();

  return (
    <section id="ai-research" className="py-24 md:py-32 bg-[#FAFAF8] dark:bg-[#0D131F]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <motion.div {...headingReveal(reduce)} className="max-w-2xl mb-20 md:mb-28 space-y-4">
          <span className="inline-block text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            My Process
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            How I Work
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed max-w-xl">
            I follow an 8-step process to move from unclear business questions{" "}
            <br className="hidden md:block" />
            to practical, evidence-backed answers
          </p>
        </motion.div>

        {/* Process grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {RESEARCH_OS.map((step, idx) => {
            const StepIcon = stepIcons[idx] || Cpu;

            return (
              <motion.div
                key={idx}
                {...itemReveal(reduce, gridDelay(idx, 4, { base: 0.12, rowStep: 0.08, colStep: 0.05 }))}
                className="relative h-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-[0_2px_10px_-6px_rgba(10,25,47,0.08)] dark:shadow-none"
              >
                {/* Icon (left) + quiet step number (right) — a ruled-off header zone, so each
                    card reads as identity-then-detail rather than one undifferentiated block. */}
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] text-consulting-navy dark:text-slate-300">
                    <StepIcon size={20} strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-xs tabular-nums tracking-[0.2em] text-consulting-slate/70 dark:text-slate-400">
                    {String(step.step).padStart(2, "0")}
                  </span>
                </div>

                <h3 className="text-lg font-semibold tracking-[-0.01em] leading-snug text-consulting-navy dark:text-[#F9FAFB]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-consulting-slate dark:text-slate-400">
                  {step.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
