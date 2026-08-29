"use client";

import { motion, useReducedMotion } from "framer-motion";
import { RESEARCH_OS, CORE_PILLARS } from "@/constants";
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
  BarChart,
  Workflow,
} from "lucide-react";

// One icon per workflow stage: Discover, Collect, Validate, Analyze,
// Synthesize, Deliver.
const stepIcons = [Search, Layers, ShieldCheck, GitBranch, Zap, FileText];

/** Capability icon by name, so CORE_PILLARS stays data rather than JSX. */
const pillarIcons: Record<string, typeof Cpu> = {
  Search,
  BarChart,
  Cpu,
  Workflow,
  Target,
};

export default function AIResearch() {
  const reduce = useReducedMotion();

  return (
    <section id="ai-research" className="py-24 md:py-32 bg-[#FAFAF8] dark:bg-[#0D131F]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <motion.div {...headingReveal(reduce)} className="max-w-2xl mb-20 md:mb-28 space-y-4">
          <span className="inline-block text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Capabilities
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            How I Use AI in Research
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed max-w-xl">
            Six stages from an unclear business question to an evidence-backed
            answer &mdash; and the point in each where AI does the work a person
            should not have to.
          </p>
        </motion.div>

        {/* Process grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                {/* What AI actually does at this stage. Naming it per-step is
                    the difference between demonstrating use and listing tools. */}
                <p className="mt-4 pt-3 border-t border-slate-200/70 dark:border-white/10 text-[13px] leading-relaxed text-consulting-royal dark:text-blue-400">
                  {step.ai}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Capabilities — what I do, stated plainly. Research first, AI as the
            multiplier, matching the order of the workflow above. */}
        <div className="mt-20 md:mt-28">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            What I Do
          </h3>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CORE_PILLARS.map((pillar, idx) => {
              const PillarIcon = pillarIcons[pillar.icon] ?? Cpu;
              return (
                <motion.div
                  key={pillar.title}
                  {...itemReveal(reduce, gridDelay(idx, 3, { base: 0.1, rowStep: 0.07, colStep: 0.05 }))}
                  className="h-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6"
                >
                  <PillarIcon
                    size={20}
                    aria-hidden="true"
                    className="text-consulting-royal dark:text-blue-400"
                  />
                  <h4 className="mt-4 text-base font-semibold tracking-[-0.01em] text-consulting-navy dark:text-[#F9FAFB]">
                    {pillar.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-consulting-slate dark:text-slate-400">
                    {pillar.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
