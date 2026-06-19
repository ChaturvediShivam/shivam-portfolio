"use client";

import { motion } from "framer-motion";
import { WHO_I_HELP } from "@/constants";
import { Card } from "@/components/ui/Card";
import { Building2, ShieldCheck, Target, Rocket, ArrowUpRight } from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  Building2: <Building2 size={22} />,
  ShieldCheck: <ShieldCheck size={22} />,
  Target: <Target size={22} />,
  Rocket: <Rocket size={22} />,
};

export default function WhoIHelp() {
  return (
    <section id="who-i-help" className="py-24 bg-[#F8FAFC] dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20 space-y-6">
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            Audience
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-[#F9FAFB]">
            Who I Help
          </h2>
          <p className="text-lg text-slate-600 dark:text-[#CBD5E1] leading-relaxed">
            Research support across strategy, intelligence, and risk-driven functions
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {WHO_I_HELP.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="h-full"
            >
              <Card className="h-full flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-consulting-royal/40 transition-all duration-300 p-8">
                <div className="w-12 h-12 rounded-xl bg-consulting-royal/10 text-consulting-royal flex items-center justify-center mb-6">
                  {iconMap[item.icon]}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-[#F9FAFB] mb-3 leading-snug">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-[#CBD5E1] leading-relaxed flex-1">
                  {item.desc}
                </p>
                <div className="mt-6 pt-6 border-t border-consulting-royal/20 flex items-center gap-1 text-xs font-semibold text-consulting-royal uppercase tracking-wider">
                  <span>Learn more</span>
                  <ArrowUpRight size={14} />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
