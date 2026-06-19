"use client";

import Link from "next/link";
import { SITE_CONFIG } from "@/constants";
import { Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-[#0B1120] transition-colors duration-300">
      <div className="section-container pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          <div>
            <h3 className="text-xl font-bold mb-4 text-consulting-navy dark:text-[#F9FAFB]">{SITE_CONFIG.name}</h3>
            <p className="text-consulting-slate dark:text-[#CBD5E1] max-w-xs">
              Helping leadership and advisory teams make sharper decisions through market intelligence, due diligence, and competitive research.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-consulting-navy dark:text-[#F9FAFB]">Quick Links</h4>
            <ul className="space-y-2 text-sm text-consulting-slate dark:text-[#CBD5E1]">
              <li><Link href="/#about" className="hover:text-consulting-royal transition-colors">About</Link></li>
              <li><Link href="/#portfolio" className="hover:text-consulting-royal transition-colors">Portfolio</Link></li>
              <li><Link href="/blog" className="hover:text-consulting-royal transition-colors">Research Notes</Link></li>
              <li><Link href="/#contact" className="hover:text-consulting-royal transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-consulting-navy dark:text-[#F9FAFB]">Availability</h4>
            <p className="text-sm text-consulting-slate dark:text-[#CBD5E1]">
              Open to strategic research, competitive intelligence, and advisory engagements.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-slate-200 dark:border-slate-700/50 gap-4">
          <p className="text-xs text-consulting-slate dark:text-[#CBD5E1]">
            © {new Date().getFullYear()} {SITE_CONFIG.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={SITE_CONFIG.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-consulting-slate dark:text-[#CBD5E1] hover:text-consulting-royal transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin size={18} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
