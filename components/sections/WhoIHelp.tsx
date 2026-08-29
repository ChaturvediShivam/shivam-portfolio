"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WHO_I_HELP, SERVICES } from "@/constants";
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
    <section id="services" className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-16 md:mb-24 space-y-4">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Work With Me
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Need research or intelligence support?
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed">
            Research and intelligence work, delivered as evidence you can act on
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

        {/* What the engagement actually is. Named the way a buyer searches for
            it, so the client question is answered on the same screen as the
            audience question rather than a page away. */}
        <div className="mt-20 md:mt-28">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Services
          </h3>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
            {SERVICES.map((service, idx) => (
              <motion.div key={service.title} {...itemReveal(reduce, gridDelay(idx, 3))}>
                <h4 className="text-base font-semibold tracking-[-0.01em] text-consulting-navy dark:text-[#F9FAFB]">
                  {service.title}
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-consulting-slate dark:text-slate-400">
                  {service.desc}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="mt-12">
            <Link
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-lg bg-consulting-navy dark:bg-white px-6 py-3 text-sm font-semibold text-white dark:text-consulting-navy transition-opacity hover:opacity-90"
            >
              Discuss a Research Project
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
