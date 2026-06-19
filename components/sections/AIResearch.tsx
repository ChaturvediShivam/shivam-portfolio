"use client";

import { motion } from "framer-motion";
import { RESEARCH_OS } from "@/constants";
import { Cpu, Zap, Rocket, Layers, Search, FileText, CheckCircle, GitBranch, Target, ShieldCheck } from "lucide-react";

const stepIcons = [
  { icon: Target, color: "text-blue-500" },
  { icon: Search, color: "text-purple-500" },
  { icon: GitBranch, color: "text-indigo-500" },
  { icon: Layers, color: "text-green-500" },
  { icon: ShieldCheck, color: "text-emerald-500" },
  { icon: Zap, color: "text-yellow-500" },
  { icon: FileText, color: "text-consulting-royal" },
  { icon: CheckCircle, color: "text-blue-600" },
];

export default function AIResearch() {
  return (
    <section id="ai-research" className="py-24 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            My Process
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB]">
            How I Work
          </h2>
          <p className="text-lg text-consulting-slate dark:text-[#CBD5E1] leading-relaxed">
            I follow an 8-step process to move from unclear business questions to practical, evidence-backed answers
          </p>
        </div>

        <div className="relative">
          {/* Connecting Line for Desktop */}
          <div className="absolute top-12 left-0 w-full h-px bg-slate-200 dark:bg-slate-700/50 hidden lg:block" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {RESEARCH_OS.map((step, idx) => {
              const StepIcon = stepIcons[idx]?.icon || Cpu;
              const color = stepIcons[idx]?.color || "text-consulting-royal";

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: idx * 0.1 }}
                  className="relative flex flex-col items-center text-center space-y-6"
                >
                  {/* Step Number & Icon */}
                  <div className="relative z-10 w-16 h-16 rounded-full bg-white dark:bg-[#111827] border-4 border-slate-100 dark:border-slate-700 shadow-md flex items-center justify-center transition-transform hover:scale-110 group">
                    <StepIcon size={24} className={`${color} group-hover:scale-110 transition-transform`} />
                    <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-consulting-navy text-white text-[10px] font-bold flex items-center justify-center">
                      {step.step}
                    </div>
                  </div>

                  <div className="space-y-3 px-2">
                    <h3 className="text-lg font-bold text-consulting-navy dark:text-[#F9FAFB]">
                      {step.title}
                    </h3>
                    <p className="text-sm text-consulting-slate dark:text-[#CBD5E1] leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
