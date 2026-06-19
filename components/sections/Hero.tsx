"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { HERO_CONTENT, SITE_CONFIG, EBOOK_DATA } from "@/constants";
import { Linkedin, LayoutDashboard, Download, ArrowRight } from "lucide-react";

const ctaIconMap: Record<string, React.ElementType<{ size?: number | string; className?: string }>> = {
  LayoutDashboard,
  Download,
  Linkedin,
};

export default function Hero() {
  return (
    <section
      id="about"
      className="relative min-h-[90vh] flex items-center overflow-hidden bg-white dark:bg-[#0B1120]"
    >
      {/* Subtle background texture */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-148640623a688-575e47298802?q=80&w=2000&auto=format&fit=crop')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-white via-transparent to-white dark:from-[#0B1120] dark:to-[#0B1120]" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: Copy + CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-7 text-center lg:text-left lg:pt-10"
          >
            {/* Badge */}
            <div className="flex justify-center lg:justify-start">
              <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-consulting-slate dark:text-[#CBD5E1] text-xs font-mono uppercase tracking-widest border border-slate-200 dark:border-slate-700/50">
                {HERO_CONTENT.badge}
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB] leading-[1.1]">
              {HERO_CONTENT.headline}
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-consulting-slate dark:text-[#CBD5E1] max-w-2xl mx-auto lg:mx-0 leading-relaxed font-light">
              {HERO_CONTENT.subheadline}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-1">
              {HERO_CONTENT.ctas.map((cta, idx) => {
                const Icon = ctaIconMap[cta.icon];
                const baseClass = "px-5 h-12 text-sm font-semibold whitespace-nowrap";
                const primaryClass =
                  "bg-consulting-navy hover:bg-consulting-navy/90 text-white";
                const outlineClass = cta.external
                  ? "border-consulting-navy/40 dark:border-[#CBD5E1]/40 text-consulting-navy dark:text-[#F9FAFB] hover:border-consulting-royal hover:text-consulting-royal hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  : "border-slate-300 dark:border-slate-600 text-consulting-slate dark:text-[#CBD5E1] hover:border-consulting-royal hover:text-consulting-royal hover:bg-slate-50 dark:hover:bg-slate-800/50";

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
                    {Icon && <Icon size={16} className="mr-2" />}
                    {cta.text}
                  </Button>
                );
              })}
            </div>

            {/* Compact inline Free Playbook CTA */}
            <div className="flex items-center justify-center lg:justify-start gap-3 pt-1">
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 pl-1 pr-4 py-1 hover:border-consulting-royal/40 hover:bg-white dark:hover:bg-[#111827] transition-colors cursor-pointer group">
                <div className="relative w-8 h-10 rounded-md overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm shrink-0">
                  <img
                    src={SITE_CONFIG.ebookCoverUrl}
                    alt={EBOOK_DATA.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-consulting-slate dark:text-[#CBD5E1] group-hover:text-consulting-navy dark:group-hover:text-[#F9FAFB] transition-colors">
                    Free Playbook:
                  </span>
                  <span className="font-semibold text-consulting-navy dark:text-[#F9FAFB] whitespace-nowrap">
                    {EBOOK_DATA.title}
                  </span>
                </div>
                <a
                  href={SITE_CONFIG.ebookPdfUrl}
                  download
                  className="inline-flex items-center text-consulting-royal font-semibold text-sm whitespace-nowrap hover:underline"
                >
                  Download
                  <ArrowRight size={14} className="ml-1" />
                </a>
              </div>
            </div>
          </motion.div>

          {/* Right: Professional photo only */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-sm aspect-[4/5]">
              <div className="absolute inset-0 rounded-2xl bg-slate-100 dark:bg-slate-800 translate-x-4 translate-y-4 -z-10" />
              <div className="relative w-full h-full rounded-2xl overflow-hidden border-8 border-white dark:border-slate-700/50 shadow-2xl">
                <img
                  src="/profile.jpg"
                  alt="Shivam Chaturvedi — Strategic Research Analyst"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-consulting-navy/20 to-transparent" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="mt-14 md:mt-20"
        >
          <div className="max-w-4xl mx-auto border-t border-b border-slate-200 dark:border-slate-700/50 py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
              {HERO_CONTENT.metrics.map((metric, idx) => (
                <div key={idx} className="text-center px-2">
                  <p className="text-2xl md:text-3xl font-bold text-consulting-navy dark:text-[#F9FAFB] tracking-tight">
                    {metric.value}
                  </p>
                  <p className="text-xs md:text-sm text-consulting-slate dark:text-[#CBD5E1] mt-1 font-medium">
                    {metric.label}
                  </p>
                </div>
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
