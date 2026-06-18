"use client";

import { motion } from "framer-motion";
import { PORTFOLIO_CASE_STUDIES } from "@/constants";
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
  return (
    <section id="portfolio" className="py-24 bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            Strategic Impact
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-consulting-navy">
            Case Study Highlights
          </h2>
          <p className="text-lg text-consulting-slate leading-relaxed">
            Turning careful analysis into practical business outcomes through structured research.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {PORTFOLIO_CASE_STUDIES.map((study, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
            >
              <Card className="h-full flex flex-col bg-consulting-navy border border-slate-700/50 rounded-2xl shadow-[0_2px_16px_rgba(2,12,27,0.45)] hover:shadow-[0_8px_32px_rgba(2,12,27,0.55)] hover:-translate-y-1 hover:border-[#C97A1E]/40 transition-all duration-300 overflow-hidden pt-0">
                <div className="h-1 w-full bg-[#C97A1E] mb-8" />

                <div className="px-8 pb-8 flex-1 flex flex-col">
                  <div className="mb-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white text-[#C97A1E] flex items-center justify-center mt-0.5 shadow-sm">
                        <BarChart3 size={22} />
                      </div>
                      <h3 className="text-[1.65rem] font-bold text-white tracking-tight leading-tight">
                        {study.title}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-7 flex-1">
                    {fields.map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-white text-[#C97A1E] flex items-center justify-center mt-0.5 shadow-sm">
                          <Icon size={16} />
                        </div>
                        <div className="space-y-1.5 min-w-0">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#E6B566]">
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
