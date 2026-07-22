"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PORTFOLIO_CASE_STUDIES } from "@/constants";
import { itemReveal, gridDelay } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import {
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
  Lightbulb,
  BarChart3,
  ChevronDown,
} from "lucide-react";

const summaryFields = [
  { key: "objective", label: "Objective" },
  { key: "scope", label: "Scope" },
] as const;

// Evidence before Methodology — a pyramid-principle order (conclusion, then proof, then
// process detail) rather than the chronological problem-first order used previously.
// An executive reader wants the answer, then what backs it up, before the how.
const narrativeFields = [
  { key: "validation", label: "Evidence", icon: ShieldCheck },
  { key: "methodology", label: "Methodology", icon: ClipboardList },
] as const;

export default function CaseStudies() {
  const reduce = useReducedMotion();
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const toggleDetails = (idx: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <section id="portfolio" className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-16 md:mb-24 space-y-4">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Strategic Impact
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Case Study Highlights
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed">
            Turning careful analysis into practical business outcomes through structured research.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {PORTFOLIO_CASE_STUDIES.map((study, idx) => {
            const isOpen = openIndices.has(idx);
            const detailsId = `case-study-details-${idx}`;

            return (
              <motion.div
                key={idx}
                {...itemReveal(reduce, gridDelay(idx, 2, { base: 0.15, rowStep: 0.22, colStep: 0.1 }))}
              >
                <Card className="h-full flex flex-col bg-consulting-navy dark:bg-[#111827] border border-white/10 rounded-xl overflow-hidden pt-0">
                  <div className="h-1 w-full bg-consulting-royal mb-9" />

                  <div className="px-8 pb-9 flex-1 flex flex-col">
                    <div className="mb-8">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white dark:bg-slate-800 text-consulting-royal flex items-center justify-center mt-0.5">
                          <BarChart3 size={22} />
                        </div>
                        <h3 className="text-xl font-semibold tracking-[-0.01em] leading-snug text-white">
                          {study.title}
                        </h3>
                      </div>
                    </div>

                    {/* Tier 1 — Outcome & Business Impact. Leads the card: this is the one thing
                        a senior reader needs to register in five seconds. The existing copy is
                        already written as a business-impact statement (result + who it serves —
                        e.g. "de-risked compliance decisions," "accelerated GTM decisions"), so one
                        unified statement carries both without inventing a second, paraphrased field
                        or fragmenting one sentence into two arbitrarily-divided halves. */}
                    <div className="rounded-lg bg-consulting-royal/15 border border-consulting-royal/30 p-5 mb-8">
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-200 mb-2">
                        <TrendingUp size={14} />
                        Outcome
                      </h4>
                      <p className="text-white leading-[1.7] font-medium text-base">
                        {study.outcome}
                      </p>
                    </div>

                    {/* Tiers 3–4 — Evidence, then Methodology: what backs the outcome up, before
                        how it was produced. Pyramid-principle order, not chronological narrative. */}
                    <div className="space-y-5 mb-2">
                      {narrativeFields.map(({ key, label, icon: Icon }) => (
                        <div key={key} className="flex gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-md bg-white dark:bg-slate-800 text-consulting-royal flex items-center justify-center mt-0.5">
                            <Icon size={14} />
                          </div>
                          <div className="space-y-1 min-w-0">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              {label}
                            </h4>
                            <p className="text-sm text-slate-200 leading-relaxed max-w-prose">
                              {study[key as keyof typeof study] as string}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tier 5 — Supporting details. Objective, Scope, Challenge, and Key Learning
                        are real evidence, kept in full, but they're context rather than
                        decision-relevant content — progressive disclosure keeps them one click
                        away instead of competing with the outcome for attention. */}
                    <div className="mt-auto pt-4 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => toggleDetails(idx)}
                        aria-expanded={isOpen}
                        aria-controls={detailsId}
                        className="group w-full flex items-center justify-between text-left -mx-2 px-2 py-2.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-consulting-royal transition-colors">
                          Supporting details
                        </span>
                        <ChevronDown
                          size={16}
                          className={`text-slate-400 group-hover:text-consulting-royal transition-transform duration-300 ${
                            isOpen ? "rotate-180 text-consulting-royal" : ""
                          }`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            id={detailsId}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="pt-3 space-y-5">
                              <div className="grid grid-cols-2 gap-6">
                                {summaryFields.map(({ key, label }) => (
                                  <div key={key} className="min-w-0">
                                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                      {label}
                                    </h5>
                                    <p className="text-sm text-slate-200 leading-relaxed">
                                      {study[key as keyof typeof study] as string}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-3">
                                <AlertTriangle size={16} className="flex-shrink-0 text-slate-400 mt-0.5" />
                                <div className="space-y-1 min-w-0">
                                  <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Challenge
                                  </h5>
                                  <p className="text-sm text-slate-200 leading-relaxed">
                                    {study.challenge}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-3 pt-5 border-t border-white/10">
                                <Lightbulb size={16} className="flex-shrink-0 text-consulting-royal mt-0.5" />
                                <p className="text-sm italic text-slate-300 leading-relaxed">
                                  {study.learning}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
