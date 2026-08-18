import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";

/**
 * The branded 404, and the only file that can be one.
 *
 * Next resolves BOTH unmatched URLs and `notFound()` calls against the root
 * not-found. In this app that boundary always renders in a bare document Next
 * synthesises itself, because there is no `app/layout.tsx` — the marketing,
 * admin and auth groups each supply their own `<html>`/`<body>`, and two root
 * layouts cannot nest. That synthesised document imports no CSS and loads no
 * font, which is exactly why the old 404 looked like Next's default.
 *
 * Three alternatives were built and measured before settling here:
 *
 *   - `app/(marketing)/not-found.tsx` alone — never fires for unmatched URLs at
 *     all; `/definitely-not-a-real-page` still rendered Next's built-in page.
 *   - A catch-all page calling `notFound()` — rendered this content but under
 *     `<html id="__next_error__">` with no navbar or footer, because a
 *     not-found at a group root IS the root not-found (groups add no URL
 *     segment), and the root boundary renders outside every group layout.
 *   - The same, nested a segment deeper — identical result.
 *
 * So the chrome is assembled here explicitly instead. `<html>`/`<body>` are
 * deliberately not rendered: the synthesised layout already provides them, and
 * emitting a second pair produces duplicate document tags that are only saved
 * by HTML parser error-recovery.
 *
 * `lang` therefore sits on the wrapper rather than on `<html>`, which this file
 * cannot reach. Assistive technology resolves language from the nearest
 * ancestor carrying it, so every word on the page is covered; only the empty
 * `<html>` element itself is not, and that is unreachable without Next gaining
 * root-layout control over synthesised boundaries.
 */

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you were looking for could not be found. Return to the homepage to explore projects, case studies, and engineering work.",
};

const inter = Inter({ subsets: ["latin"] });

/**
 * The routes actually worth offering someone who landed somewhere wrong.
 *
 * Mirrors NAV_LINKS minus the homepage anchor the CTA above already covers.
 * Research Notes (/blog) is omitted for the same reason it is absent from the
 * nav and footer — pointing a lost visitor at three unwritten notes is not
 * help. Restore it alongside those two when the section ships.
 */
const DESTINATIONS = [
  { href: "/#projects", label: "Projects", hint: "Applications I designed and built" },
  { href: "/#portfolio", label: "Research", hint: "Selected research engagements" },
  { href: "/#contact", label: "Contact", hint: "Start a conversation" },
];

export default function NotFound() {
  return (
    <div lang="en" className={inter.className}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Navbar />
        {/* Paints its own background, exactly as every section on the homepage
            does. Not decoration: `globals.css` styles `body` light and only
            repaints it via `.dark body`, which does not win here, so a page
            that relies on the body backdrop shows light grey behind
            dark-mode text. Sections elsewhere hide that by painting
            themselves; this page has to do the same. `min-h-screen` keeps the
            same backdrop behind short content instead of letting the body
            show through beneath the fold. */}
        <main className="min-h-screen bg-white dark:bg-[#0B1120]">
          {/* No motion, matching the `blog/[slug]` empty state this is modelled
              on. A page reached by mistake is not the place to spend a reveal. */}
          <div className="section-container max-w-4xl">
            <div className="py-12 md:py-20">
              {/* Kicker — the rule-plus-label editorial mark the sections use. */}
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-px w-8 bg-consulting-royal" />
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
                  Error 404
                </span>
              </div>

              <h1 className="mt-8 text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
                This page could not be found.
              </h1>

              <p className="mt-6 text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed max-w-xl">
                The address you followed doesn&apos;t point to anything on this
                site — it may have been moved, or it may never have existed.
                Nothing is broken; everything else is exactly where it was.
              </p>

              <div className="mt-10">
                <Button
                  href="/"
                  variant="primary"
                  size="lg"
                  className="group inline-flex items-center justify-center px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120] bg-consulting-navy hover:bg-consulting-navy-light text-white shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5"
                >
                  Back to Home
                  <ArrowRight
                    size={18}
                    className="ml-2 transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Button>
              </div>

              {/* Secondary routes, given the quieter treatment the footer's quick
                  links use rather than a second row of buttons competing. */}
              <div className="mt-16 pt-8 border-t border-slate-200 dark:border-white/10">
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
                  Or continue to
                </p>
                <ul className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {DESTINATIONS.map((destination) => (
                    <li key={destination.href}>
                      <Link
                        href={destination.href}
                        className="group block text-consulting-navy dark:text-[#F9FAFB] font-medium hover:text-consulting-royal dark:hover:text-consulting-royal transition-colors duration-200 ease-calm"
                      >
                        {destination.label}
                        <span
                          aria-hidden="true"
                          className="inline-block ml-1 transition-transform duration-200 group-hover:translate-x-0.5"
                        >
                          &rarr;
                        </span>
                        <span className="block mt-1 text-sm font-normal text-consulting-slate dark:text-slate-400">
                          {destination.hint}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </ThemeProvider>
    </div>
  );
}
