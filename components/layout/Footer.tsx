"use client";

import Link from "next/link";
import { SITE_CONFIG, HERO_CONTENT } from "@/constants";
import { LinkedinIcon } from "@/components/ui/LinkedinIcon";

export default function Footer() {
  return (
    <footer className="border-t border-consulting-royal/15 dark:border-white/10 bg-slate-50 dark:bg-[#0B1120] transition-colors duration-300">
      <div className="section-container pt-20 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">
          {/* Brand — the closing signature, given the same lockup as the navbar's
              opening one so the site visibly bookends itself. */}
          <div className="md:col-span-6 space-y-4">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB]">
                {SITE_CONFIG.name}
              </p>
              <span aria-hidden="true" className="h-4 w-px bg-slate-300 dark:bg-slate-600" />
              <span className="text-xs font-mono uppercase tracking-widest text-consulting-slate dark:text-[#CBD5E1]">
                Strategic Research
              </span>
            </div>
            <p className="text-consulting-slate dark:text-[#CBD5E1] max-w-sm leading-relaxed">
              Helping leadership and advisory teams make sharper decisions through market intelligence, due diligence, and competitive research.
            </p>
          </div>

          <div className="md:col-span-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400 mb-4">
              Quick Links
            </p>
            <ul className="space-y-2.5 text-sm text-consulting-slate dark:text-[#CBD5E1]">
              <li><Link href="/#about" className="hover:text-consulting-royal transition-colors duration-200 ease-calm">About</Link></li>
              <li><Link href="/#portfolio" className="hover:text-consulting-royal transition-colors duration-200 ease-calm">Case Studies</Link></li>
              <li><Link href="/blog" className="hover:text-consulting-royal transition-colors duration-200 ease-calm">Research Notes</Link></li>
              <li><Link href="/#contact" className="hover:text-consulting-royal transition-colors duration-200 ease-calm">Contact</Link></li>
            </ul>
          </div>

          <div className="md:col-span-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400 mb-4">
              Availability
            </p>
            <p className="text-sm text-consulting-slate dark:text-[#CBD5E1] leading-relaxed">
              Open to strategic research, competitive intelligence, and advisory engagements.
            </p>
          </div>
        </div>

        {/* Closing credentials — the same real figures Hero opens with, echoed quietly
            here rather than restated with new copy, so the page visibly bookends itself. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-t border-slate-200 dark:border-white/10 mb-8">
          {HERO_CONTENT.metrics.map((metric, idx) => (
            <div key={idx}>
              <p className="text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB] tracking-tight tabular-nums">
                {metric.value}
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                {metric.label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-slate-200 dark:border-slate-700/50 gap-4">
          <p className="text-xs text-consulting-slate dark:text-[#CBD5E1]">
            © {new Date().getFullYear()} {SITE_CONFIG.name}. All rights reserved.
          </p>
          <Link
            href={SITE_CONFIG.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 dark:border-white/10 text-consulting-slate dark:text-[#CBD5E1] hover:border-consulting-royal hover:text-consulting-royal transition-colors duration-200 ease-calm"
          >
            <LinkedinIcon size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
