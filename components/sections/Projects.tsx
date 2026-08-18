"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { PROJECTS } from "@/constants";
import { itemReveal, gridDelay } from "@/lib/motion";
import { Card } from "@/components/ui/Card";

/**
 * Engineering projects.
 *
 * Placed above the research case studies on the homepage, because the role
 * being applied for is an engineering one and the first screenful decides
 * whether the rest gets read. The research section stays exactly where it was —
 * it is the reason the product thinking in these projects is credible, not
 * something to bury.
 *
 * Each card is a summary; the full problem/architecture/decisions write-up
 * lives at /projects/[slug]. Cards deliberately show the stack up front: a
 * technical reader scanning for "does this person use what we use" should not
 * have to open a page to find out.
 */
export default function Projects() {
  const reduce = useReducedMotion();

  return (
    <section id="projects" className="py-24 md:py-32 bg-[#FBF8F2] dark:bg-[#111827]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-16 md:mb-20 space-y-4">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
            Engineering
          </span>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            Projects
          </h2>
          <p className="text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed">
            Applications I designed and built end to end — architecture, AI integration,
            data model, and the decisions behind them.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {PROJECTS.map((project, idx) => (
            <motion.div key={project.slug} {...itemReveal(reduce, gridDelay(idx, 2))}>
              <Card className="h-full flex flex-col p-8 md:p-10">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <h3 className="text-2xl font-semibold tracking-[-0.01em] text-consulting-navy dark:text-[#F9FAFB]">
                      {project.name}
                    </h3>
                    <p className="text-sm text-consulting-slate dark:text-slate-300 leading-relaxed">
                      {project.tagline}
                    </p>
                  </div>
                  {project.aiImplementation && (
                    <span
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-consulting-royal/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-consulting-royal dark:text-blue-400"
                      title="This project includes an LLM integration"
                    >
                      <Sparkles size={11} aria-hidden="true" />
                      AI
                    </span>
                  )}
                </div>

                <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-mono uppercase tracking-[0.12em] text-consulting-slate/70 dark:text-slate-400/70">
                  <div className="flex gap-1.5">
                    <dt className="sr-only">Role</dt>
                    <dd>{project.role}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="sr-only">Status</dt>
                    <dd>{project.status}</dd>
                  </div>
                </dl>

                <p className="mt-6 text-sm text-consulting-slate dark:text-slate-300 leading-relaxed flex-1">
                  {project.problem}
                </p>

                <ul className="mt-6 flex flex-wrap gap-2" aria-label={`${project.name} tech stack`}>
                  {project.stack.map((tech) => (
                    <li
                      key={tech}
                      className="rounded-md bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] text-consulting-slate dark:text-slate-300"
                    >
                      {tech}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Link
                    href={`/projects/${project.slug}`}
                    className="group inline-flex items-center gap-1.5 text-sm font-semibold text-consulting-royal hover:text-consulting-royal-dark transition-colors duration-200"
                  >
                    Read the case study
                    <ArrowRight
                      size={15}
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>

                  {project.liveUrl && (
                    <a
                      href={project.liveUrl}
                      // External live sites open in a new tab so the portfolio
                      // is not navigated away from; the in-app demo does not.
                      target={project.liveUrl.startsWith("http") ? "_blank" : undefined}
                      rel={project.liveUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-consulting-slate/80 dark:text-slate-400 hover:text-consulting-royal dark:hover:text-consulting-royal transition-colors duration-200"
                    >
                      {project.liveLabel}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
