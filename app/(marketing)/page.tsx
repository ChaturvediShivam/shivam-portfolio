"use client";

import Hero from "@/components/sections/Hero";
import About from "@/components/sections/About";
import CaseStudies from "@/components/sections/CaseStudies";
import Ebook from "@/components/sections/Ebook";
import Skills from "@/components/sections/Skills";
import WhoIHelp from "@/components/sections/WhoIHelp";
import AIResearch from "@/components/sections/AIResearch";
import CTA from "@/components/sections/CTA";
import Contact from "@/components/sections/Contact";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <Hero />
      <AIResearch />
      <About />
      <CaseStudies />
      <Skills />
      <WhoIHelp />
      <Ebook />
      <CTA />
      <Contact />
    </div>
  );
}
