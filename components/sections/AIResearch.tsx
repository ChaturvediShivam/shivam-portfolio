"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RESEARCH_OS } from "@/constants";
import { EASE_CALM } from "@/lib/motion";
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
  const ease = EASE_CALM;

  return (
    <section id="ai-research" className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <div className="max-w-2xl mb-16 md:mb-24 space-y-4">
          <span className="inline-block text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal font-semibold">
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
        </div>

        {/* Process grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {RESEARCH_OS.map((step, idx) => {
            const StepIcon = stepIcons[idx] || Cpu;

            return (
              <motion.div
                key={idx}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: (idx % 4) * 0.07, ease }}
                className="group relative h-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 transition-all duration-300 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-[0_16px_32px_-20px_rgba(10,25,47,0.18)] dark:hover:shadow-[0_16px_32px_-20px_rgba(0,0,0,0.55)] focus-within:border-consulting-royal/40"
              >
                {/* Icon (left) + quiet step number (right) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] text-consulting-navy dark:text-slate-300">
                    <StepIcon size={20} strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-xs tabular-nums tracking-[0.18em] text-consulting-slate/50 dark:text-slate-500">
                    {String(step.step).padStart(2, "0")}
                  </span>
                </div>

                <h3 className="mt-6 text-lg font-semibold tracking-[-0.01em] leading-snug text-consulting-navy dark:text-[#F9FAFB]">
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
