"use client";

import { SITE_CONFIG, RESEARCH_NOTES } from "@/constants";
import { Card } from "@/components/ui/Card";
import { ArrowUpRight, BookOpen, Clock } from "lucide-react";
import Link from "next/link";

export default function ResearchNotesPage() {
  return (
    <div className="section-container py-24">
      <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
        <div className="inline-flex p-3 rounded-2xl bg-consulting-royal/10 text-consulting-royal mb-4">
          <BookOpen size={32} />
        </div>
        <h1 className="text-4xl font-bold dark:text-white">Research Notes</h1>
        <p className="text-lg text-consulting-slate dark:text-slate-400">
          Practical notes on research methods, verification, and turning information into useful insights.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {RESEARCH_NOTES.map((note, idx) => (
          <Card key={idx} className="group flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-consulting-royal px-2 py-1 rounded bg-consulting-royal/10">
                {note.category}
              </span>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Clock size={12} />
                <span>{note.status}</span>
              </div>
            </div>
            <h3 className="text-xl font-bold mb-3 dark:text-white group-hover:text-consulting-royal transition-colors">
              {note.title}
            </h3>
            <p className="text-consulting-slate dark:text-slate-400 text-sm leading-relaxed mb-8 flex-1">
              {note.summary}
            </p>
            <Link href={`/blog/${note.slug}`} className="flex items-center gap-2 text-sm font-bold text-consulting-royal group-hover:gap-3 transition-all">
              Read Note <ArrowUpRight size={16} />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
