"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { headingReveal } from "@/lib/motion";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  const reduce = useReducedMotion();

  return (
    <section id="cta" className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
      <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
        <motion.div {...headingReveal(reduce)} className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Ready for Decision-Ready Research?
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Whether it&apos;s market intelligence, competitive analysis, due diligence, or industry mapping — I help leadership teams transform complex information into clear, risk-backed decisions.
          </p>
        </motion.div>

        <motion.div {...headingReveal(reduce, 0.1)}>
          <Button
            href="/#contact"
            variant="primary"
            size="lg"
            className="group inline-flex items-center justify-center px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120] bg-consulting-navy hover:bg-consulting-navy-light text-white shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5"
          >
            <span className="mr-2">Start a Conversation</span>
            <ArrowRight size={18} />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
