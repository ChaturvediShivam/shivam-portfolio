"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { HERO_CONTENT, SITE_CONFIG } from "@/constants";
import { Linkedin, LayoutDashboard } from "lucide-react";

export default function Hero() {
  return (
    <section id="home" className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-white">
      {/* High-End Background Element */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-148640623a688-575e47298802?q=80&w=2000&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />

      {/* Gradient Overlays for Depth */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-white via-transparent to-white" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-8"
        >
          {/* Positioning Badge */}
          <div className="flex justify-center">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-100 text-consulting-slate text-xs font-mono uppercase tracking-widest border border-slate-200">
              {HERO_CONTENT.badge}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-consulting-navy leading-[1.1]">
            {HERO_CONTENT.headline}
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-consulting-slate max-w-3xl mx-auto leading-relaxed font-light">
            {HERO_CONTENT.subheadline}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            {HERO_CONTENT.ctas.map((cta, idx) => (
              <Button
                key={idx}
                href={cta.href}
                external={cta.href.startsWith("http")}
                variant={cta.primary ? "primary" : "outline"}
                size="lg"
                className={`px-8 h-12 transition-all duration-300 ${
                  cta.primary
                    ? 'bg-consulting-navy hover:bg-consulting-navy/90 text-white'
                    : 'border-slate-300 text-consulting-slate hover:border-consulting-royal hover:text-consulting-royal'
                }`}
              >
                {cta.text}
                {cta.text.includes("LinkedIn") && <Linkedin size={18} className="ml-2" />}
                {cta.text.includes("Portfolio") && <LayoutDashboard size={18} className="ml-2" />}
              </Button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Decorative Element */}
      <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-white to-transparent z-10" />
    </section>
  );
}
