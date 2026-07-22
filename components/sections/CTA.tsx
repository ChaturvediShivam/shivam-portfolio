"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { headingReveal } from "@/lib/motion";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  const reduce = useReducedMotion();

  return (
    <section id="cta" className="relative overflow-hidden py-24 md:py-32 bg-consulting-navy dark:bg-[#0B1120]">
      {/* A quiet vignette easing into the section's own dark tone at each edge — a deliberate
          dark "conclusion" moment against its lighter neighbors, not a color-matched blend
          (bridging near-white to navy directly produces a muddy gray band; easing within
          the dark end of the palette avoids that while still softening the hard seam). */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-consulting-navy-light dark:from-white/[0.03] to-transparent opacity-60 pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-consulting-navy-light dark:from-white/[0.03] to-transparent opacity-60 pointer-events-none"
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center space-y-10">
        <motion.div {...headingReveal(reduce)} className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-white">
            Ready for Decision-Ready Research?
          </h2>
          <p className="text-base md:text-lg text-white/70 leading-relaxed max-w-2xl mx-auto">
            Whether it&apos;s market intelligence, competitive analysis, due diligence, or industry mapping — I help leadership teams transform complex information into clear, risk-backed decisions.
          </p>
        </motion.div>

        <motion.div {...headingReveal(reduce, 0.35)} className="relative inline-block">
          {/* A quiet spotlight, not a glass panel — a blurred glow behind an otherwise
              fully opaque button, so the CTA reads as the moment the page arrives at. */}
          <div aria-hidden="true" className="absolute -inset-8 rounded-full bg-white/[0.06] blur-2xl pointer-events-none" />
          <Button
            href="/#contact"
            variant="primary"
            size="lg"
            className="relative group inline-flex items-center justify-center px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-consulting-navy bg-white hover:bg-slate-100 text-consulting-navy shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.4)] hover:-translate-y-0.5"
          >
            <span className="mr-2">Start a Conversation</span>
            <ArrowRight size={18} />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
