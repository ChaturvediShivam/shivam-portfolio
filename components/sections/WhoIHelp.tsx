"use client";

import { motion, useReducedMotion } from "framer-motion";
import { WHO_I_HELP } from "@/constants";
import { itemReveal, gridDelay } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import { Building2, ShieldCheck, Target, Rocket } from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  Building2: <Building2 size={22} />,
  ShieldCheck: <ShieldCheck size={22} />,
  Target: <Target size={22} />,
  Rocket: <Rocket size={22} />,
};

export default function WhoIHelp() {
  const reduce = useReducedMotion();

  return (
    <section id="who-i-help" className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-16 md:mb-24 space-y-4">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Audience
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Who I Help
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed">
            Research support across strategy, intelligence, and risk-driven functions
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-stretch">
          {WHO_I_HELP.map((item, idx) => (
            <motion.div
              key={idx}
              {...itemReveal(reduce, gridDelay(idx, 4))}
              className="h-full"
            >
              <Card className="h-full flex flex-col bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 p-6">
                <div className="flex items-center justify-center w-11 h-11 rounded-lg border border-slate-200 dark:border-white/10 bg-consulting-royal/[0.06] dark:bg-white/[0.03] text-consulting-royal mb-6">
                  {iconMap[item.icon]}
                </div>
                <h3 className="text-lg font-semibold tracking-[-0.01em] leading-snug text-consulting-navy dark:text-[#F9FAFB] mb-3">
                  {item.title}
                </h3>
                <p className="text-sm text-consulting-slate dark:text-slate-300 leading-relaxed flex-1">
                  {item.desc}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
