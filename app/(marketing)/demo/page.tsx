import type { Metadata } from "next";
import { featureEnabled } from "@/lib/featureFlags";
import { DemoWorkspace } from "@/components/demo/DemoWorkspace";

export const metadata: Metadata = {
  title: "Resume AI — live demo",
  description:
    "Paste a job description, upload a resume, and see the deterministic ATS score plus an AI review of the gaps. No sign-up.",
};

/**
 * The public Resume AI demo.
 *
 * A Server Component holding no logic beyond the flag: it decides whether the
 * demo exists, then hands the interactive half to the client. Every rule about
 * who may run an analysis lives in the server action, not here — this gate only
 * avoids rendering a form that the action would refuse anyway.
 *
 * The flag being off is a normal state, not an error. The page still renders,
 * still explains what the demo is, and still links to the write-up and the
 * source; it simply cannot be run.
 */
export default function DemoPage() {
  const enabled = featureEnabled("FEATURE_PUBLIC_DEMO");
  // NEXT_PUBLIC_ by definition: this is the widget's public site key, not the
  // secret the server verifies with.
  const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? null;

  return (
    <main className="section-container py-16 md:py-24">
      <header className="max-w-3xl">
        <p className="text-xs font-mono uppercase tracking-widest text-consulting-slate dark:text-slate-400">
          Live demo
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-consulting-navy dark:text-white md:text-4xl">
          Resume AI
        </h1>
        <p className="mt-4 text-base leading-relaxed text-consulting-slate dark:text-slate-300">
          Score a resume against a job description. The match score is computed
          deterministically on the server — no model involved — and an AI review
          then explains the gaps. Try it with the bundled sample or your own file.
        </p>
      </header>

      {enabled ? (
        <DemoWorkspace siteKey={siteKey} />
      ) : (
        <p
          className="mt-10 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-consulting-slate dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
          role="status"
        >
          The live demo is not available right now. The write-up below covers how
          it works.
        </p>
      )}
    </main>
  );
}
