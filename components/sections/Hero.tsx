"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { HERO_CONTENT } from "@/constants";
import { EASE_CALM } from "@/lib/motion";
import { Linkedin, LayoutDashboard, MessageSquare } from "lucide-react";

const ctaIconMap: Record<string, React.ElementType<{ size?: number | string; className?: string }>> = {
  LayoutDashboard,
  MessageSquare,
  Linkedin,
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

  return (
    <section
      id="about"
      className="relative min-h-[90vh] flex items-center overflow-hidden bg-white dark:bg-[#0B1120]"
    >
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

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left: Copy + CTAs */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left lg:pt-8"
          >
            {/* Badge */}
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center px-4 py-2 rounded-full bg-slate-50 dark:bg-white/[0.04] text-consulting-slate dark:text-[#CBD5E1] text-[11px] font-mono uppercase tracking-[0.18em] border border-slate-200/80 dark:border-white/10">
                {HERO_CONTENT.badge}
              </span>
            </motion.div>

            {/* Headline — copy unchanged; manually broken into 4 editorial lines (md+), two key phrases in brand accent. */}
            <motion.h1
              variants={fadeUp}
              className="mt-8 text-3xl sm:text-4xl md:text-[2.5rem] lg:text-[2.75rem] font-semibold tracking-[-0.02em] leading-[1.08] text-consulting-navy dark:text-[#F9FAFB] max-w-[42rem] lg:max-w-none text-balance"
            >
              Turning fragmented information{" "}
              <br className="hidden md:block" />
              into <span className="text-consulting-royal">strategic intelligence</span>,{" "}
              <br className="hidden md:block" />
              competitive insight, and{" "}
              <br className="hidden md:block" />
              <span className="text-consulting-royal">risk-backed business decisions</span>.
            </motion.h1>

            {/* Subheadline — reduced weight to sharpen headline dominance. */}
            <motion.p
              variants={fadeUp}
              className="mt-6 text-sm md:text-base text-consulting-slate/80 dark:text-slate-300/80 max-w-xl leading-relaxed font-light text-pretty"
            >
              {HERO_CONTENT.subheadline}
            </motion.p>

            {/* CTAs — identical height, uniform spacing, aligned. */}
            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              {HERO_CONTENT.ctas.map((cta, idx) => {
                const Icon = ctaIconMap[cta.icon];
                const baseClass =
                  "group inline-flex items-center justify-center px-6 h-12 text-sm font-semibold whitespace-nowrap rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120]";
                const primaryClass =
                  "bg-consulting-navy hover:bg-consulting-navy-light text-white shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5";
                const outlineClass = cta.external
                  ? "border border-consulting-navy/25 dark:border-white/15 text-consulting-navy dark:text-[#F9FAFB] hover:border-consulting-royal hover:text-consulting-royal hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:-translate-y-0.5"
                  : "border border-slate-300 dark:border-white/15 text-consulting-slate dark:text-[#CBD5E1] hover:border-consulting-royal hover:text-consulting-royal hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:-translate-y-0.5";

                return (
                  <Button
                    key={idx}
                    href={cta.href}
                    variant={cta.primary ? "primary" : "outline"}
                    size="lg"
                    external={cta.external}
                    className={`${baseClass} ${cta.primary ? primaryClass : outlineClass}`}
                  >
                    {Icon && <Icon size={16} className="mr-2 transition-transform duration-200 group-hover:translate-x-0.5" />}
                    {cta.text}
                  </Button>
                );
              })}
            </motion.div>
          </motion.div>

          {/* Right: Professional portrait — annual-report photograph */}
          <motion.div
            variants={imageIn}
            initial="hidden"
            animate="show"
            className="lg:col-span-5 relative flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-sm aspect-[4/5]">
              <div className="relative w-full h-full rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shadow-[0_24px_48px_-24px_rgba(10,25,47,0.28)] dark:shadow-[0_24px_52px_-24px_rgba(0,0,0,0.6)]">
                <img
                  src="/profile.jpg"
                  alt="Shivam Chaturvedi — Strategic Research Consultant"
                  className="w-full h-full object-cover"
                  fetchPriority="high"
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
            <div className="grid grid-cols-2 md:grid-cols-4">
              {HERO_CONTENT.metrics.map((metric, idx) => (
                <motion.div
                  key={idx}
                  variants={metricIn}
                  className="text-center px-4 md:border-l border-slate-200 dark:border-white/[0.08] md:first:border-l-0"
                >
                  <p className="text-2xl md:text-[2.5rem] font-semibold text-consulting-navy dark:text-[#F9FAFB] tracking-tight tabular-nums leading-none">
                    {metric.value}
                  </p>
                  <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-consulting-slate/70 dark:text-slate-400/70 font-medium">
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
