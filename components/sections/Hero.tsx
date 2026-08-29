"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { HERO_CONTENT } from "@/constants";
import { EASE_CALM } from "@/lib/motion";
import { LayoutDashboard, MessageSquare, Download, Handshake } from "lucide-react";
import { LinkedinIcon } from "@/components/ui/LinkedinIcon";

const ctaIconMap: Record<string, React.ElementType<{ size?: number | string; className?: string }>> = {
  LayoutDashboard,
  MessageSquare,
  Download,
  Handshake,
  Linkedin: LinkedinIcon,
};

// Inline SVG noise — keeps the texture off the network (no remote fetch).
const NOISE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export default function Hero() {
  const reduce = useReducedMotion();

  // Calm, Apple-grade easing — shared with every other section via lib/motion.
  // Transforms drop out under reduced-motion.
  const ease = EASE_CALM;

  const fadeUp: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
      };

  const imageIn: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }
    : {
        hidden: { opacity: 0, y: 28, scale: 0.985 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.9, ease } },
      };

  const stagger: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  };

  const metricIn: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3 } } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
      };

  // This section deliberately carries no `id`. It once had `id="about"`, which
  // made the About nav link resolve to the top of the page and left the real
  // About section unreachable by anchor. The id now lives on that section.
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-white dark:bg-[#0B1120]">
      {/* One faint overhead radial — functional lighting that draws the eye up to the headline. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none dark:hidden"
        style={{
          backgroundImage:
            "radial-gradient(60% 40% at 50% -10%, rgba(37,99,235,0.035), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none hidden dark:block"
        style={{
          backgroundImage:
            "radial-gradient(60% 42% at 50% -10%, rgba(37,99,235,0.07), transparent 60%)",
        }}
      />

      {/* Whisper of noise for tactile depth (anti-banding). */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.02] dark:opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: `url('${NOISE_URL}')`, backgroundSize: "180px 180px" }}
      />

      {/* Smooth handoff into the next section. */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-[#0B1120] pointer-events-none" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-28 md:py-36">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Left: Copy + CTAs */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left lg:pt-8"
          >
            {/* Kicker — a rule-plus-label editorial mark, not a SaaS pill. */}
            <motion.div variants={fadeUp} className="flex items-center justify-center lg:justify-start gap-3">
              <span aria-hidden="true" className="h-px w-8 bg-consulting-royal" />
              <span className="text-consulting-slate dark:text-[#CBD5E1] text-[11px] font-mono uppercase tracking-[0.18em]">
                {HERO_CONTENT.badge}
              </span>
            </motion.div>

            {/* Headline — two editorial lines (md+). "Research & Intelligence"
                carries the accent, not "AI": the accent marks the core identity,
                and AI is the qualifier that follows it. */}
            <motion.h1
              variants={fadeUp}
              className="mt-10 text-[1.875rem] sm:text-[2.25rem] md:text-[2.75rem] lg:text-[3.25rem] font-semibold tracking-[-0.02em] leading-[1.15] text-consulting-navy dark:text-[#F9FAFB] max-w-[42rem] lg:max-w-none text-balance"
            >
              Strategic <span className="text-consulting-royal">Research &amp; Intelligence</span>,{" "}
              <br className="hidden md:block" />
              Powered by <span className="text-consulting-royal">AI</span>.
            </motion.h1>

            {/* Subheadline — reduced weight to sharpen headline dominance. */}
            <motion.p
              variants={fadeUp}
              className="mt-6 text-sm md:text-base text-consulting-slate/80 dark:text-slate-300/80 max-w-xl leading-relaxed font-light text-pretty"
            >
              {HERO_CONTENT.subheadline}
            </motion.p>

            {/* Credibility line — the years of actual experience, stated before
                any AI claim so the foundation reads first. */}
            <motion.p
              variants={fadeUp}
              className="mt-4 text-sm md:text-base font-medium text-consulting-navy dark:text-slate-200"
            >
              {HERO_CONTENT.credibility}
            </motion.p>

            {/* Primary CTAs — one filled, one outlined; identical height, uniform spacing. */}
            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col sm:flex-row sm:flex-wrap items-center justify-center lg:justify-start gap-4"
            >
              {HERO_CONTENT.ctas.filter((cta) => !cta.external).map((cta, idx) => {
                const Icon = ctaIconMap[cta.icon];
                const baseClass =
                  "group inline-flex items-center justify-center px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120]";
                const primaryClass =
                  "bg-consulting-navy hover:bg-consulting-navy-light text-white shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5";
                const outlineClass =
                  "border border-slate-300 dark:border-white/15 text-consulting-slate dark:text-[#CBD5E1] hover:border-consulting-royal hover:text-consulting-royal hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:-translate-y-0.5";

                return (
                  <Button
                    key={idx}
                    href={cta.href}
                    variant={cta.primary ? "primary" : "outline"}
                    size="lg"
                    external={cta.external}
                    download={cta.download}
                    className={`${baseClass} ${cta.primary ? primaryClass : outlineClass}`}
                  >
                    {Icon && <Icon size={16} className="mr-2 transition-transform duration-200 group-hover:translate-x-0.5" />}
                    {cta.text}
                  </Button>
                );
              })}
            </motion.div>

            {/* Tertiary link — social profile, deliberately lower-weight than the two conversion CTAs above. */}
            {HERO_CONTENT.ctas.filter((cta) => cta.external).map((cta, idx) => {
              const Icon = ctaIconMap[cta.icon];
              return (
                <motion.a
                  key={idx}
                  variants={fadeUp}
                  href={cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-consulting-slate/70 dark:text-slate-400/70 hover:text-consulting-royal dark:hover:text-consulting-royal transition-colors duration-200"
                >
                  {Icon && <Icon size={15} />}
                  {cta.text}
                </motion.a>
              );
            })}
          </motion.div>

          {/* Right: Professional portrait — the visual anchor of the page.
              No frame, no border on the photo itself — an editorial crop, presented
              directly, the way a real photograph is treated rather than a UI thumbnail.
              A companion panel sits behind it (never touching it) so the portrait reads
              as seated within the composition rather than a box placed beside the text. */}
          <motion.div
            variants={imageIn}
            initial="hidden"
            animate="show"
            className="lg:col-span-5 relative flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-md lg:max-w-none aspect-[4/5]">
              <div
                aria-hidden="true"
                className="absolute -bottom-5 -right-5 w-full h-full rounded-sm bg-consulting-royal/[0.07] dark:bg-consulting-royal/[0.14] -z-10"
              />
              <div className="relative w-full h-full overflow-hidden">
                <Image
                  // Derived from /public/profile.jpg — the original stays in
                  // place, untouched. The derivative is cropped to the 4:5 this
                  // container expects (so nothing is re-cropped at render), and
                  // the office glazing behind is optically softened rather than
                  // masked out: a blurred, desaturated copy of the same frame,
                  // revealed only away from the subject. No cutout, no matte.
                  src="/assets/profile-hero.jpg"
                  alt="Shivam Chaturvedi — Strategic Research &amp; Intelligence, Powered by AI"
                  fill
                  sizes="(min-width: 1024px) 487px, (min-width: 640px) 448px, 90vw"
                  priority
                  className="object-cover grayscale-[8%] contrast-[1.03] saturate-[0.96]"
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Metrics strip — editorial statistics, numbers dominate */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="mt-16 md:mt-24"
        >
          <div className="max-w-4xl mx-auto border-t border-b border-slate-200 dark:border-white/10 py-8">
            <div className="grid grid-cols-3">
              {HERO_CONTENT.metrics.map((metric, idx) => (
                <motion.div
                  key={idx}
                  variants={metricIn}
                  className="text-center px-2 sm:px-4 md:border-l border-slate-200 dark:border-white/[0.08] md:first:border-l-0"
                >
                  <p className="text-2xl md:text-[2.5rem] font-semibold text-consulting-navy dark:text-[#F9FAFB] tracking-tight tabular-nums leading-none">
                    {metric.value}
                  </p>
                  <p className="mt-4 text-[11px] uppercase tracking-[0.08em] sm:tracking-[0.18em] text-consulting-slate/70 dark:text-slate-400/70 font-medium">
                    {metric.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom decorative fade */}
      <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-white dark:from-[#0B1120] to-transparent z-10 pointer-events-none" />
    </section>
  );
}
