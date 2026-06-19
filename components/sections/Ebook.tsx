"use client";

import { motion } from "framer-motion";
import { EBOOK_DATA, SITE_CONFIG } from "@/constants";
import { Button } from "@/components/ui/Button";
import { Download, BookOpen, Award, ArrowRight, CheckCircle } from "lucide-react";

export default function EbookSection() {
  return (
    <section id="ebook" className="py-24 bg-white dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative group"
          >
            {/* Professional 3D-style Mockup */}
            <div className="relative aspect-[3/4] max-w-md mx-auto shadow-2xl rounded-2xl overflow-hidden border-4 border-white dark:border-slate-700/50">
              <img
                src={SITE_CONFIG.ebookCoverUrl}
                alt="The Research Playbook"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-consulting-navy/40 to-transparent" />
            </div>
            <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-consulting-royal/10 rounded-full blur-3xl -z-10" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-10"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-consulting-royal font-semibold uppercase tracking-widest text-xs">
                <Award size={16} />
                <span>Free Resource</span>
              </div>
              <h2 className="text-4xl font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB] leading-tight">
                {EBOOK_DATA.title}
              </h2>
              <p className="text-lg text-consulting-slate dark:text-[#CBD5E1] italic leading-relaxed">
                &ldquo;{EBOOK_DATA.subtitle}&rdquo;
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-3 text-consulting-navy dark:text-[#F9FAFB] font-bold text-lg">
                <BookOpen size={20} className="text-consulting-royal" />
                <span>What You&apos;ll Learn</span>
              </div>
              <ul className="grid grid-cols-1 gap-4">
                {EBOOK_DATA.takeaways.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-consulting-slate dark:text-[#CBD5E1] text-sm leading-relaxed group"
                  >
                    <CheckCircle
                      size={16}
                      className="mt-0.5 text-consulting-royal shrink-0 group-hover:scale-110 transition-transform"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700/50 shadow-sm space-y-3">
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
                className="w-full sm:w-auto bg-consulting-navy hover:bg-consulting-navy/90 text-white px-8 h-14 text-base"
              >
                <Download size={18} className="mr-2" />
                Download Free Playbook
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
