"use client";

import { motion } from "framer-motion";
import Hero from "@/components/sections/Hero";
import About from "@/components/sections/About";
import CaseStudies from "@/components/sections/CaseStudies";
import Ebook from "@/components/sections/Ebook";
import Skills from "@/components/sections/Skills";
import AIResearch from "@/components/sections/AIResearch";
import CTA from "@/components/sections/CTA";
import Contact from "@/components/sections/Contact";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <Hero />
      <AIResearch /> {/* This is now the ROS Visualization */}
      <About />       {/* The Evolution Narrative / The Bridge */}
      <CaseStudies /> {/* Technical Blueprint Portfolio */}
      <Skills />      {/* Evidence Map */}
      <Ebook />       {/* The Framework */}
      <CTA />         {/* Final Call-to-Action */}
      <Contact />      {/* Professional Conversion */}
    </div>
  );
}
