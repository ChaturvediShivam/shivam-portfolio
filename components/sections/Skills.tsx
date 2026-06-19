"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SKILLS_EVIDENCE_MAP } from "@/constants";
import { Cpu, Wrench, Layout, ShieldCheck, BookOpen, Database, ChevronDown } from "lucide-react";

export default function Skills() {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <section id="skills" className="py-24 bg-[#F8FAFC] dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
          <span className="text-xs font-mono uppercase tracking-widest text-consulting-royal font-semibold">
            Capabilities
          </span>
          <h2 className="text-4xl font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB]">
            Skills & Research Infrastructure
          </h2>
          <p className="text-lg text-consulting-slate dark:text-[#CBD5E1] leading-relaxed">
            Practical capabilities built through real engagements across due diligence, market intelligence, and competitive analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
          {/* Research & Analysis */}
          <SkillCategory
            title="Research & Analysis"
            icon={<Search size={20} />}
            skills={SKILLS_EVIDENCE_MAP.researchIntelligence}
            categoryKey="researchIntelligence"
            openKey={openKey}
            setOpenKey={setOpenKey}
          />

          {/* Due Diligence & Risk */}
          <SkillCategory
            title="Due Diligence & Risk"
            icon={<ShieldCheck size={20} />}
            skills={SKILLS_EVIDENCE_MAP.dueDiligence}
            categoryKey="dueDiligence"
            openKey={openKey}
            setOpenKey={setOpenKey}
          />

          {/* Market & Industry */}
          <SkillCategory
            title="Market & Industry"
            icon={<BarChart3 size={20} />}
            skills={SKILLS_EVIDENCE_MAP.marketResearch}
            categoryKey="marketResearch"
            openKey={openKey}
            setOpenKey={setOpenKey}
          />

          {/* Data Collection & Validation */}
          <SkillCategory
            title="Collection & Validation"
            icon={<Database size={20} />}
            skills={SKILLS_EVIDENCE_MAP.validation}
            categoryKey="validation"
            openKey={openKey}
            setOpenKey={setOpenKey}
          />

          {/* AI-Assisted Research */}
          <SkillCategory
            title="AI-Assisted Research"
            icon={<Cpu size={20} />}
            skills={SKILLS_EVIDENCE_MAP.aiResearch}
            categoryKey="aiResearch"
            openKey={openKey}
            setOpenKey={setOpenKey}
          />

          {/* Research Infrastructure */}
          <SkillCategory
            title="Research Infrastructure"
            icon={<Wrench size={20} />}
            skills={SKILLS_EVIDENCE_MAP.researchInfrastructure}
            categoryKey="researchInfrastructure"
            openKey={openKey}
            setOpenKey={setOpenKey}
            isTool={true}
          />
        </div>
      </div>
    </section>
  );
}

function SkillCategory({ title, icon, skills, categoryKey, openKey, setOpenKey, isTool = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-consulting-royal/10 text-consulting-royal">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-consulting-navy dark:text-[#F9FAFB]">{title}</h3>
      </div>
      <div className="space-y-3">
        {skills.map((item, idx) => {
          const itemKey = `${categoryKey}-${idx}`;
          const isOpen = openKey === itemKey;

          return (
            <div
              key={idx}
              className={`rounded-xl border bg-slate-50 dark:bg-slate-800/40 transition-all overflow-hidden ${
                isOpen
                  ? "border-consulting-royal/40 shadow-sm"
                  : "border-slate-100 dark:border-slate-700 hover:border-consulting-royal/30"
              }`}
            >
              <button
                onClick={() => setOpenKey(isOpen ? null : itemKey)}
                className="w-full flex items-center justify-between p-3 text-left group"
                aria-expanded={isOpen}
              >
                <span
                  className={`text-sm font-medium transition-colors ${
                    isOpen
                      ? "text-consulting-navy dark:text-[#F9FAFB]"
                      : "text-consulting-slate dark:text-[#CBD5E1] group-hover:text-consulting-navy dark:group-hover:text-[#F9FAFB]"
                  }`}
                >
                  {isTool ? item.tool : item.skill}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase text-slate-400 group-hover:text-consulting-royal transition-colors hidden sm:inline">
                    {item.source}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 group-hover:text-consulting-royal transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-consulting-royal" : ""
                    }`}
                  />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-4 pt-1 space-y-3 text-sm">
                      <div className="sm:hidden">
                        <span className="text-[10px] font-mono uppercase text-slate-400">{item.source}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-consulting-navy dark:text-[#F9FAFB]">What it means:</span>
                        <p className="text-consulting-slate dark:text-[#CBD5E1] mt-1 leading-relaxed">{item.meaning}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-consulting-navy dark:text-[#F9FAFB]">How I used it:</span>
                        <p className="text-consulting-slate dark:text-[#CBD5E1] mt-1 leading-relaxed">{item.usage}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// Utility Icons
const Search = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const BarChart3 = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 15h2" />
    <path d="M3 11h4" />
    <path d="M3 7h2" />
    <path d="M12 15h2" />
    <path d="M12 11h4" />
    <path d="M12 7h2" />
    <path d="M21 15h-2" />
    <path d="M21 11h-4" />
    <path d="M21 7h-2" />
  </svg>
);
