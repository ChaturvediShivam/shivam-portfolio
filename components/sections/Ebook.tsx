"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EBOOK_DATA, SITE_CONFIG } from "@/constants";
import { headingReveal, imageReveal } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Download, BookOpen, Award, ArrowRight, CheckCircle } from "lucide-react";

export default function EbookSection() {
  const reduce = useReducedMotion();

  return (
    <section id="ebook" className="py-24 md:py-32 bg-[#F8FAFC] dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            {...imageReveal(reduce)}
            className="relative"
          >
            {/* Book cover — same visual language as the portraits */}
            <div className="relative aspect-[3/4] max-w-md mx-auto rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shadow-[0_24px_48px_-24px_rgba(10,25,47,0.28)] dark:shadow-[0_24px_52px_-24px_rgba(0,0,0,0.6)]">
              <img
                src={SITE_CONFIG.ebookCoverUrl}
                alt="The Research Playbook"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>

          <motion.div
            {...headingReveal(reduce, 0.1)}
            className="space-y-10"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-consulting-royal font-mono font-semibold uppercase tracking-[0.18em] text-[11px]">
                <Award size={16} />
                <span>Proprietary Methodology</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
                {EBOOK_DATA.title}
              </h2>
              <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 italic leading-relaxed">
                &ldquo;{EBOOK_DATA.subtitle}&rdquo;
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3 text-consulting-navy dark:text-[#F9FAFB] font-semibold text-lg tracking-[-0.01em]">
                <BookOpen size={20} className="text-consulting-royal" />
                <span>What You&apos;ll Learn</span>
              </div>
              <ul className="grid grid-cols-1 gap-4">
                {EBOOK_DATA.takeaways.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-consulting-slate dark:text-[#CBD5E1] text-sm leading-relaxed"
                  >
                    <CheckCircle size={16} className="mt-0.5 text-consulting-royal shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-3">
              <h4 className="font-bold text-consulting-navy dark:text-[#F9FAFB] text-sm uppercase tracking-wider">
                Why I wrote this book
              </h4>
              <p className="text-sm text-consulting-slate dark:text-[#CBD5E1] leading-relaxed">
                {EBOOK_DATA.description}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <Button
                href={SITE_CONFIG.ebookPdfUrl}
                download
                variant="primary"
                size="lg"
                className="group inline-flex items-center justify-center w-full sm:w-auto px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120] bg-consulting-navy hover:bg-consulting-navy-light text-white shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5"
              >
                <Download size={18} className="mr-2" />
                Download the Playbook
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                PDF | 2.4 MB | English
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
