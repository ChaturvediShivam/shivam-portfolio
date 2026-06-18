"use client";

import Link from "next/link";
import { SITE_CONFIG } from "@/constants";
import { Button } from "@/components/ui/Button";
import { Linkedin, Mail } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-consulting-navy-dark transition-colors duration-300">
      <div className="section-container pt-20 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          <div>
            <h3 className="text-xl font-bold mb-4 dark:text-white">{SITE_CONFIG.name}</h3>
            <p className="text-consulting-slate dark:text-slate-400 max-w-xs">
              Helping businesses make smarter decisions through market research, due diligence, and competitive intelligence.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4 dark:text-white">Quick Links</h4>
            <ul className="space-y-2 text-sm text-consulting-slate dark:text-slate-400">
              <li><Link href="#about" className="hover:text-consulting-royal transition-colors">About</Link></li>
              <li><Link href="#services" className="hover:text-consulting-royal transition-colors">Services</Link></li>
              <li><Link href="#portfolio" className="hover:text-consulting-royal transition-colors">Portfolio</Link></li>
              <li><Link href="/blog" className="hover:text-consulting-royal transition-colors">Insights</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 dark:text-white">Newsletter</h4>
            <p className="text-sm text-consulting-slate dark:text-slate-400 mb-4">
              Newsletter signup is temporarily disabled while the mailing service is being configured.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <input
                type="email"
                placeholder="Email"
                disabled
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-consulting-navy-light text-sm outline-none focus:ring-2 focus:ring-consulting-royal transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Button size="sm" type="submit" disabled>Join</Button>
            </form>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-slate-200 dark:border-slate-800 gap-4">
          <p className="text-xs text-consulting-slate dark:text-slate-400">
            © {new Date().getFullYear()} {SITE_CONFIG.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={SITE_CONFIG.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-consulting-slate hover:text-consulting-royal transition-colors"
            >
              <Linkedin size={18} />
            </Link>
            <Link href={`mailto:${SITE_CONFIG.email}`} className="text-consulting-slate hover:text-consulting-royal transition-colors">
              <Mail size={18} />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
