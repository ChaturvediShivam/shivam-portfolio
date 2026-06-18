"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  return (
    <section id="cta" className="py-20 bg-[#F8FAFC]">
      <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-consulting-navy">
            Ready for Decision-Ready Research?
          </h2>
          <p className="text-lg md:text-xl text-consulting-slate leading-relaxed max-w-2xl mx-auto">
            Whether it&apos;s market intelligence, competitive analysis, due diligence, or industry mapping — I help leadership teams transform complex information into clear, risk-backed decisions.
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
            <span className="mr-2">Start a Conversation</span>
            <ArrowRight size={18} />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
