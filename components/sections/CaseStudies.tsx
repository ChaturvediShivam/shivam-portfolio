"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PORTFOLIO_CASE_STUDIES } from "@/constants";
import { itemReveal, gridDelay } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import {
  Target,
  Globe,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
  Lightbulb,
  BarChart3,
} from "lucide-react";

const fields = [
  { key: "objective", label: "Objective", icon: Target },
  { key: "scope", label: "Scope", icon: Globe },
  { key: "challenge", label: "Challenge", icon: AlertTriangle },
  { key: "methodology", label: "Methodology", icon: ClipboardList },
  { key: "validation", label: "Validation", icon: ShieldCheck },
  { key: "outcome", label: "Outcome", icon: TrendingUp },
  { key: "learning", label: "Key Learning", icon: Lightbulb },
] as const;

export default function CaseStudies() {
  const reduce = useReducedMotion();

  return (
    <section id="portfolio" className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-16 md:mb-24 space-y-4">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal font-semibold">
            Strategic Impact
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Case Study Highlights
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed">
            Turning careful analysis into practical business outcomes through structured research.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {PORTFOLIO_CASE_STUDIES.map((study, idx) => (
            <motion.div
              key={idx}
              {...itemReveal(reduce, gridDelay(idx, 2))}
            >
              <Card className="h-full flex flex-col bg-consulting-navy dark:bg-[#111827] border border-white/10 rounded-xl hover:border-consulting-royal/40 hover:shadow-[0_16px_32px_-20px_rgba(0,0,0,0.55)] hover:-translate-y-0.5 transition-all duration-300 ease-calm overflow-hidden pt-0">
                <div className="h-1 w-full bg-consulting-royal mb-8" />

                <div className="px-8 pb-8 flex-1 flex flex-col">
                  <div className="mb-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white dark:bg-slate-800 text-consulting-royal flex items-center justify-center mt-0.5">
                        <BarChart3 size={22} />
                      </div>
                      <h3 className="text-lg font-semibold tracking-[-0.01em] leading-snug text-white">
                        {study.title}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-7 flex-1">
                    {fields.map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-white dark:bg-slate-800 text-consulting-royal flex items-center justify-center mt-0.5">
                          <Icon size={16} />
                        </div>
                        <div className="space-y-1.5 min-w-0">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                            {label}
                          </h4>
                          <p className="text-slate-200 leading-[1.7] max-w-prose">
                            {study[key as keyof typeof study] as string}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
