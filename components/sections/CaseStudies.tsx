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
    <section id="portfolio" className="py-24 bg-white dark:bg-consulting-background-dark">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            Strategic Impact
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-consulting-navy dark:text-white">
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
              <Card className="h-full flex flex-col">
                <div className="mb-6 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-consulting-royal/10 text-consulting-royal flex items-center justify-center">
                      <BarChart3 size={20} />
                    </div>
                    <h3 className="text-2xl font-bold text-consulting-navy dark:text-white tracking-tight">
                      {study.title}
                    </h3>
                  </div>
                </div>

                <div className="space-y-5 flex-1">
                  {fields.map(({ key, label, icon: Icon }) => (
                    <div key={key} className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-slate-100 dark:bg-consulting-navy text-consulting-royal flex items-center justify-center mt-0.5">
                        <Icon size={16} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {label}
                        </h4>
                        <p className="text-consulting-slate dark:text-slate-300 leading-relaxed">
                          {study[key as keyof typeof study] as string}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
