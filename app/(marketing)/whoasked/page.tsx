import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { SITE_CONFIG } from "@/constants";

/**
 * Who Asked? — the media property, not a sales page.
 *
 * A Server Component with no client JavaScript, matching the other marketing
 * pages. Deliberately short: this page exists so the Instagram bio has a
 * destination that explains the thing and then offers one door to VBYB. It
 * does not restate the VBYB offer — that page already does it properly, and
 * two competing pitches would weaken both.
 */

const PAGE_URL = `${SITE_CONFIG.url}/whoasked`;
const TITLE = "Who Asked? — Stories About Ideas, Founders and Building";
const DESCRIPTION =
  "Stories about ideas, founders and the reality of building. And a system for testing whether anyone actually wants the thing you are about to build.";
const OG_IMAGE = { url: `${SITE_CONFIG.url}/og-image.png`, width: 1200, height: 630 };

const INSTAGRAM = "https://www.instagram.com/whoasked.ideas/";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: SITE_CONFIG.name,
    locale: "en_US",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
};

const CONTAINER = "max-w-3xl mx-auto px-6";
const BTN =
  "group inline-flex items-center justify-center gap-2 px-6 py-3 min-h-12 text-sm font-semibold rounded-lg transition-all duration-200 ease-calm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const THEMES = [
  "Founder stories, told short",
  "Business ideas, held up to the light",
  "The part of building nobody posts about",
  "Reality checks worth hearing",
];

export default function WhoAskedPage() {
  return (
    <main>
      {/* 1 · The property */}
      <section className="py-24 md:py-32 bg-white dark:bg-[#0B1120]">
        <div className={CONTAINER}>
          <p className="text-[11px] font-mono tracking-[0.18em] text-consulting-royal dark:text-blue-400">
            A media project by {SITE_CONFIG.name}
          </p>
          <h1 className="mt-5 text-4xl md:text-6xl font-semibold tracking-[-0.03em] text-consulting-navy dark:text-[#F9FAFB]">
            Who Asked?
          </h1>
          <p className="mt-6 text-lg md:text-xl leading-relaxed text-consulting-slate dark:text-slate-300">
            Stories about ideas, founders and the reality of building.
          </p>
          <p className="mt-4 text-base leading-relaxed text-consulting-slate dark:text-slate-400">
            Everyone has an idea. It will change everything. Everyone will use it. It just needs to be built.
            <span className="block mt-2 font-semibold text-consulting-navy dark:text-slate-200">
              One small problem — who asked?
            </span>
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BTN} bg-consulting-navy text-white hover:bg-consulting-royal dark:bg-white dark:text-consulting-navy dark:hover:bg-slate-200 focus-visible:ring-consulting-royal`}
            >
              Watch on Instagram
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <span className="inline-flex items-center text-sm text-consulting-slate dark:text-slate-400">
              @whoasked.ideas
            </span>
          </div>
        </div>
      </section>

      {/* 2 · What it is */}
      <section className="py-20 md:py-24 bg-[#FBF8F2] dark:bg-[#111827]">
        <div className={CONTAINER}>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em] text-consulting-navy dark:text-[#F9FAFB]">
            What this is
          </h2>
          <p className="mt-5 text-base leading-relaxed text-consulting-slate dark:text-slate-300">
            Short films about the moment an idea meets the world. Some are funny, some are uncomfortable, most are
            both. They are made with AI because AI is the cheapest way to film a story that has no budget — the tool,
            not the subject.
          </p>
          <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {THEMES.map((theme) => (
              <li
                key={theme}
                className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] px-5 py-4 text-sm font-medium text-consulting-navy dark:text-slate-200"
              >
                {theme}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-base leading-relaxed text-consulting-slate dark:text-slate-300">
            The point of all of it is to make you want to do something. Sometimes that is build it. Sometimes it is
            test it first. Sometimes it is admit you have been avoiding the one conversation that would settle it.
          </p>
        </div>
      </section>

      {/* 3 · One door to the product. Not a pitch — the page it links to does that. */}
      <section className="py-20 md:py-24 bg-white dark:bg-[#0B1120]">
        <div className={CONTAINER}>
          <div className="rounded-xl border border-consulting-royal/25 dark:border-blue-400/25 bg-[#FBF8F2] dark:bg-[#111827] p-8 md:p-10">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em] text-consulting-navy dark:text-[#F9FAFB]">
              Have an idea?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-consulting-slate dark:text-slate-300">
              Before you build it, test whether anyone actually wants it. That is a method, not a mood — assumptions,
              evidence, what would prove you wrong, the cheapest test that could, and a decision you can defend.
            </p>
            <Link
              href="/validate-before-you-build"
              className={`${BTN} mt-8 bg-consulting-royal text-white hover:bg-consulting-navy focus-visible:ring-consulting-royal`}
            >
              Explore Validate Before You Build
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
