"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EBOOK_DATA, SITE_CONFIG } from "@/constants";
import { headingReveal, imageReveal, useTilt } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Download, BookOpen, Award, ArrowRight } from "lucide-react";

export default function EbookSection() {
  const reduce = useReducedMotion();
  const { rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt(2);

  return (
    <section id="ebook" className="py-24 md:py-32 bg-[#F8FAFC] dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            {...imageReveal(reduce)}
            className="relative"
            style={{ perspective: 1000 }}
            {...(reduce ? {} : { onMouseMove, onMouseLeave })}
          >
            {/* Page-stack hint — a single offset layer suggesting physical thickness,
                so this reads as a bound publication rather than a flat PDF icon. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 aspect-[3/4] max-w-md mx-auto translate-x-2 translate-y-2 rounded-sm bg-consulting-navy/25 dark:bg-white/[0.05]"
            />
            {/* Book cover — typography-first, rendered from the site's own type and
                color system rather than a stock illustration. The tilt supplies the
                physical, held-in-hand quality; the surface itself stays quiet. */}
            <motion.div
              style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
              className="relative aspect-[3/4] max-w-md mx-auto rounded-sm overflow-hidden bg-consulting-navy shadow-[0_24px_48px_-24px_rgba(10,25,47,0.28)] dark:shadow-[0_24px_52px_-24px_rgba(0,0,0,0.6)]"
            >
              {/* Spine hint — a faint edge, not an illustration */}
              <div className="absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black/25 to-transparent" />
              <div className="relative h-full flex flex-col justify-between p-8 md:p-10">
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal-light font-semibold">
                  Proprietary Methodology
                </span>
                <div className="space-y-5">
                  <h3 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-[1.05] text-white">
                    {EBOOK_DATA.title}
                  </h3>
                  <div className="h-px w-12 bg-white/25" />
                  <p className="text-sm text-white/60 leading-relaxed">{EBOOK_DATA.subtitle}</p>
                </div>
                <div className="pt-6 border-t border-white/10">
                  <p className="text-sm font-semibold text-white">{SITE_CONFIG.name}</p>
                  <p className="text-xs text-white/50 font-mono uppercase tracking-wider mt-0.5">
                    AI Application Engineer
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            {...headingReveal(reduce, 0.3)}
            className="space-y-10"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-consulting-royal dark:text-blue-400 font-mono font-semibold uppercase tracking-[0.18em] text-[11px]">
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
              {/* Numbered like a table of contents, not a generic checklist —
                  the numbers are the takeaway array's own index, not new content. */}
              <ul className="space-y-4">
                {EBOOK_DATA.takeaways.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-4 text-consulting-slate dark:text-[#CBD5E1] text-sm leading-relaxed"
                  >
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full border border-consulting-royal/30 text-consulting-royal dark:text-blue-400 text-[11px] font-mono font-semibold">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Author's note — a pull-quote treatment, not another bordered card,
                so it reads as a personal excerpt rather than one more UI panel. */}
            <div className="pl-6 border-l-2 border-consulting-royal/30 space-y-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Why I wrote this book
              </h3>
              <p className="text-base text-consulting-navy dark:text-[#F9FAFB] italic leading-relaxed">
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
              {/* Edition details, colophon-style, rather than a raw file-size caption. */}
              <div className="flex items-center gap-3 pt-1">
                <span aria-hidden="true" className="h-px w-6 bg-slate-300 dark:bg-slate-700" />
                <p className="text-[11px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  PDF | 2.4 MB | English
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
