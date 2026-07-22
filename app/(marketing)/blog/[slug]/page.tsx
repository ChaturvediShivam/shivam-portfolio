import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ResearchNote({ params }: { params: { slug: string } }) {
  return (
    <div className="section-container py-24 max-w-4xl mx-auto px-6">
      <Link href="/blog" className="flex items-center gap-2 text-sm font-medium text-consulting-slate dark:text-[#CBD5E1] hover:text-consulting-royal transition-colors mb-12">
        <ArrowLeft size={16} />
        Back to Research Notes
      </Link>

      <div className="text-center space-y-6 py-20">
        <div className="inline-flex p-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H2z"/><path d="M2 16h14"/><path d="M2 12h14"/><path d="M2 8h14"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-consulting-navy dark:text-[#F9FAFB]">Note in Development</h1>
        <p className="text-consulting-slate dark:text-[#CBD5E1] max-w-md mx-auto">
          This specific research note on <span className="font-semibold">&ldquo;{params.slug.replace(/-/g, ' ')}&rdquo;</span> is currently being drafted. Check back soon for the full analysis.
        </p>
      </div>
    </div>
  );
}
