"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  return (
    <section id="cta" className="py-24 bg-slate-100">
      <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-consulting-navy">
            Let&apos;s Work Together
          </h2>
          <p className="text-lg md:text-xl text-consulting-slate leading-relaxed max-w-2xl mx-auto">
            If you&apos;re looking for market research, competitive analysis, due diligence, or structured business intelligence, feel free to reach out.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <Button
            variant="primary"
            size="lg"
            className="bg-consulting-navy text-white hover:bg-consulting-navy/90 px-8"
            onClick={() => {
              document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Contact Me
            <ArrowRight size={18} className="ml-2" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
