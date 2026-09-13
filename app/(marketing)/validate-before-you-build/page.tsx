import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Minus } from "lucide-react";
import { SITE_CONFIG, VALIDATE_PRODUCT } from "@/constants";

/**
 * Validate Before You Build — product landing page.
 *
 * A Server Component with no client JavaScript, like the project case studies:
 * the page is read, and its only interactions (the in-page jump and the FAQ
 * disclosures) are a native anchor and <details>. It borrows the site's type
 * scale, palette and button language rather than introducing a second one.
 */

const PAGE_URL = `${SITE_CONFIG.url}/validate-before-you-build`;
const TITLE = "Validate Before You Build — Evidence-First Idea Validation";
const DESCRIPTION =
  "Find out if your idea deserves the next month before you build it. An evidence-first validation system for AI, SaaS and digital product builders.";
const OG_IMAGE = { url: `${SITE_CONFIG.url}/og-image.png`, width: 1200, height: 630 };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  // A page-level openGraph replaces the layout's object wholesale, so the share
  // card is restated here rather than silently dropped.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: SITE_CONFIG.name,
    locale: "en_US",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
};

// Until the Gumroad product URL is set, buy CTAs point at the offer on this
// page — never at a dead or guessed checkout link. See VALIDATE_PRODUCT.
const BUY_HREF = VALIDATE_PRODUCT.gumroadUrl || "#founding-version";
const BUY_LABEL = "Get the Founding Version — $39";

const BTN =
  "group inline-flex items-center justify-center gap-2 px-6 py-3 min-h-12 text-center text-sm font-semibold rounded-lg transition-all duration-200 ease-calm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const BTN_PRIMARY = `${BTN} bg-consulting-navy hover:bg-consulting-navy-light text-white dark:bg-white dark:text-consulting-navy dark:hover:bg-slate-100 shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)] hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)] hover:-translate-y-0.5 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120]`;
const BTN_OUTLINE = `${BTN} border border-slate-300 dark:border-white/15 text-consulting-slate dark:text-[#CBD5E1] hover:border-consulting-royal hover:text-consulting-royal hover:-translate-y-0.5 focus-visible:ring-consulting-royal/60 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0B1120]`;
const BTN_ON_NAVY = `${BTN} bg-white hover:bg-slate-100 text-consulting-navy shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)] hover:-translate-y-0.5 focus-visible:ring-white/60 focus-visible:ring-offset-consulting-navy`;

const H2 =
  "text-3xl sm:text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB] text-balance";
const LEAD = "text-base md:text-lg text-consulting-slate dark:text-slate-300 leading-relaxed";
const CONTAINER = "max-w-7xl mx-auto px-6";
const SECTION_WHITE = "py-24 md:py-32 bg-white dark:bg-[#0B1120]";
const SECTION_CREAM = "py-24 md:py-32 bg-[#FBF8F2] dark:bg-[#111827]";

type VerdictLabel = "BUILD" | "TEST MORE" | "PARK" | "KILL";
const VERDICTS: VerdictLabel[] = ["BUILD", "TEST MORE", "PARK", "KILL"];
const VERDICT_TONE: Record<VerdictLabel, string> = {
  BUILD: "border-emerald-600/30 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300",
  "TEST MORE": "border-amber-600/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300",
  PARK: "border-slate-400/40 bg-slate-500/[0.08] text-slate-600 dark:text-slate-300",
  KILL: "border-rose-600/30 bg-rose-500/[0.08] text-rose-700 dark:text-rose-300",
};
const VERDICT_TONE_ON_NAVY: Record<VerdictLabel, string> = {
  BUILD: "border-emerald-400/40 text-emerald-300",
  "TEST MORE": "border-amber-400/40 text-amber-300",
  PARK: "border-white/25 text-slate-300",
  KILL: "border-rose-400/40 text-rose-300",
};

const PROBLEM_ATTEMPTS = [
  "You can spend weeks researching.",
  "You can ask ChatGPT for a market analysis.",
  "You can build an MVP in days.",
  "You can collect dozens of opinions.",
];

const METHOD = [
  { n: "01", name: "Assumptions", questions: ["What must be true for this idea to work?"] },
  {
    n: "02",
    name: "Evidence",
    questions: ["What evidence do you actually have?", "Where did it come from?", "How strong is it?"],
  },
  { n: "03", name: "Falsifier", questions: ["What result would make you stop?"] },
  {
    n: "04",
    name: "Cheapest test",
    questions: ["What is the fastest, cheapest real-world test of the riskiest assumption?"],
  },
  { n: "05", name: "Decision", questions: ["Based on the evidence, should you:"] },
];

const DELIVERABLES = [
  {
    title: "Idea Brief + Quick Kill",
    desc: "Clarify the idea and identify early reasons it may not deserve more time.",
  },
  {
    title: "Assumption Map",
    desc: "Identify what must be true and which assumptions are most dangerous.",
  },
  {
    title: "Evidence Ledger",
    desc: "Separate actual evidence from opinions, assumptions and AI-generated claims.",
  },
  {
    title: "Risk / Falsifier Analysis",
    desc: "Define what evidence would seriously challenge the idea before you get emotionally attached to it.",
  },
  {
    title: "Cheapest Test",
    desc: "Choose a practical real-world test for the riskiest assumption.",
  },
  {
    title: "Decision Record",
    desc: "Turn the test result into a written BUILD / TEST MORE / PARK / KILL decision.",
  },
  {
    title: "AI Challenger Prompts",
    desc: "Use AI to challenge assumptions, process evidence and pressure-test decisions — without treating AI output as proof.",
  },
];

const AI_USES = [
  "find hidden assumptions",
  "challenge your reasoning",
  "structure messy evidence",
  "improve interview questions",
  "design cheaper tests",
  "challenge your final decision",
];

const GOOD_FIT = [
  "You have a real product idea.",
  "You are capable of building it.",
  "You are tempted to start coding immediately.",
  "You aren't sure whether the evidence is strong enough.",
  "You want a decision, not another 40-page market report.",
  "You are willing to talk to users, test assumptions and face uncomfortable evidence.",
];

const NOT_A_FIT = [
  "You want someone to tell you your idea is good.",
  "You want an AI-generated market report.",
  "You want guaranteed validation.",
  "You don't want to interact with real potential customers.",
];

const FILE_FOCUS = [
  "what must be true",
  "what evidence you actually have",
  "how strong that evidence is",
  "the assumption most likely to kill the idea",
  "the cheapest useful test",
  "the current evidence-supported decision",
];

const FAQS = [
  {
    q: "Is this an AI idea validator?",
    a: "No. AI is used to challenge and process the work. AI-generated claims are not treated as evidence.",
  },
  {
    q: "Do I get a market research report?",
    a: "No. The goal is a decision about what to test next, not a generic market report.",
  },
  {
    q: "What happens after I pay?",
    a: "You submit your idea and existing evidence through the submission form. Your Validation File is then prepared manually and delivered within 48 hours.",
  },
  {
    q: "Is $39 a subscription?",
    a: "No. It is a one-time founding-version purchase.",
  },
  {
    q: "Does this guarantee my idea will succeed?",
    a: "No. It is designed to help you make a better decision before committing more time and resources.",
  },
  {
    q: "What if the idea is bad?",
    a: "That's the point. A useful outcome can be BUILD, TEST MORE, PARK or KILL.",
  },
];

function Eyebrow({ children, onNavy = false }: { children: React.ReactNode; onNavy?: boolean }) {
  return (
    <p
      className={`text-[11px] font-mono uppercase tracking-[0.18em] font-semibold ${
        onNavy ? "text-blue-300" : "text-consulting-royal dark:text-blue-400"
      }`}
    >
      {children}
    </p>
  );
}

function Verdict({ label, onNavy = false }: { label: VerdictLabel; onNavy?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded border px-2 py-1 text-[10px] font-mono font-semibold tracking-[0.14em] whitespace-nowrap ${
        (onNavy ? VERDICT_TONE_ON_NAVY : VERDICT_TONE)[label]
      }`}
    >
      {label}
    </span>
  );
}

function Unknown() {
  return (
    <span className="inline-flex rounded border border-dashed border-amber-600/50 dark:border-amber-400/50 px-2 py-0.5 text-[10px] font-mono font-semibold tracking-[0.14em] text-amber-700 dark:text-amber-300">
      UNKNOWN
    </span>
  );
}

function BuyLink({ className, children = BUY_LABEL }: { className: string; children?: React.ReactNode }) {
  const external = BUY_HREF.startsWith("http");
  return (
    <a
      href={BUY_HREF}
      className={className}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {children}
      <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </a>
  );
}

function TallyLink({ className }: { className: string }) {
  return (
    <a href={VALIDATE_PRODUCT.tallyUrl} target="_blank" rel="noopener noreferrer" className={className}>
      Submit Your Idea
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

type ArtifactRow = { label: string; value: React.ReactNode };

function Artifact({ kind, id, rows }: { kind: string; id: string; rows: ArtifactRow[] }) {
  return (
    <article className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] overflow-hidden shadow-[0_8px_30px_-18px_rgba(10,25,47,0.25)]">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-consulting-navy dark:text-[#F9FAFB]">
          {kind}
        </h3>
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-consulting-slate dark:text-slate-400">
          Example · {id}
        </span>
      </header>
      <dl className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {rows.map((row) => (
          <div key={row.label} className="px-5 py-4">
            <dt className="text-[10px] font-mono uppercase tracking-[0.16em] text-consulting-slate dark:text-slate-400">
              {row.label}
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-consulting-navy dark:text-slate-200">{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function Flow({ steps, emphasis }: { steps: string[]; emphasis: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((step, idx) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={`rounded-md border px-2.5 py-1.5 text-xs font-mono uppercase tracking-[0.1em] ${
              emphasis
                ? "border-consulting-royal/30 bg-consulting-royal/[0.06] text-consulting-navy dark:text-[#F9FAFB]"
                : "border-slate-200 dark:border-white/10 text-consulting-slate dark:text-slate-400"
            }`}
          >
            {step}
          </span>
          {idx < steps.length - 1 && (
            <ArrowRight size={14} aria-hidden="true" className="text-consulting-slate/60 dark:text-slate-500" />
          )}
        </li>
      ))}
    </ol>
  );
}

export default function ValidateBeforeYouBuildPage() {
  return (
    <div className="flex flex-col">
      {/* 1 · Hero */}
      <section className="relative overflow-hidden bg-white dark:bg-[#0B1120]">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(60% 40% at 50% -10%, rgba(37,99,235,0.06), transparent 60%)" }}
        />
        <div className={`relative ${CONTAINER} pt-36 pb-20 md:pt-44 md:pb-28`}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-16 items-center">
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-px w-8 bg-consulting-royal" />
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-slate dark:text-[#CBD5E1]">
                  Validate Before You Build
                </span>
              </div>
              <h1 className="mt-8 text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.4rem] font-semibold tracking-[-0.025em] leading-[1.08] text-consulting-navy dark:text-[#F9FAFB] text-balance">
                Find out if your idea deserves <span className="text-consulting-royal">the next month</span> before you
                build it.
              </h1>
              <p className={`mt-6 max-w-xl ${LEAD}`}>
                A practical, evidence-first validation system for solo builders using AI, code, SaaS and digital
                products.
              </p>
              <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-consulting-navy dark:text-slate-200">
                Find the assumption most likely to kill your idea, test it cheaply, and make a clear BUILD / TEST MORE /
                PARK / KILL decision.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row sm:flex-wrap gap-4">
                <BuyLink className={`${BTN_PRIMARY} w-full sm:w-auto`} />
                <a href="#method" className={`${BTN_OUTLINE} w-full sm:w-auto`}>
                  See How It Works
                </a>
              </div>
              <p className="mt-5 text-xs text-consulting-slate dark:text-slate-400">
                One-time founding price · File delivered within 48 hours · 7-day refund
              </p>
            </div>

            {/* The rules of the file — what makes this a decision system, stated
                as the artifact states it, not as marketing. */}
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-[0_8px_30px_-12px_rgba(10,25,47,0.18)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                  <span className="text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-consulting-navy dark:text-[#F9FAFB]">
                    Validation File
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-consulting-slate dark:text-slate-400">
                    Ground rules
                  </span>
                </div>
                <dl className="divide-y divide-slate-100 dark:divide-white/[0.06] text-sm">
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-consulting-slate dark:text-slate-400">AI-generated claim</dt>
                    <dd className="font-medium text-consulting-navy dark:text-slate-200">Not evidence</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-consulting-slate dark:text-slate-400">Unsupported claim</dt>
                    <dd>
                      <Unknown />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-consulting-slate dark:text-slate-400">Riskiest assumption</dt>
                    <dd className="font-medium text-consulting-navy dark:text-slate-200">Tested first</dd>
                  </div>
                  <div className="px-5 py-4">
                    <dt className="text-consulting-slate dark:text-slate-400">Output</dt>
                    <dd className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {VERDICTS.map((v) => (
                        <Verdict key={v} label={v} />
                      ))}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · Problem */}
      <section className={SECTION_CREAM}>
        <div className={`${CONTAINER} grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16`}>
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-28 self-start">
            <Eyebrow>The problem</Eyebrow>
            <h2 className={H2}>Before you build, answer one harder question.</h2>
            <p className={LEAD}>AI makes it easier than ever to build something.</p>
            <p className="text-base md:text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB]">
              That doesn&apos;t make it easier to know whether you should.
            </p>
          </div>
          <div className="lg:col-span-7">
            <ul className="border-t border-slate-300/70 dark:border-white/10">
              {PROBLEM_ATTEMPTS.map((line, idx) => (
                <li
                  key={line}
                  className="flex items-baseline gap-5 py-5 border-b border-slate-300/70 dark:border-white/10"
                >
                  <span className="text-[11px] font-mono text-consulting-slate dark:text-slate-500">0{idx + 1}</span>
                  <span className="text-lg md:text-xl text-consulting-navy dark:text-slate-200">{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-2xl md:text-3xl font-medium tracking-[-0.015em] leading-snug text-consulting-navy dark:text-[#F9FAFB] text-balance">
              And still not know whether the idea deserves another month of your time.
            </p>
            <div className="mt-10 pl-6 border-l-2 border-consulting-royal space-y-3">
              <p className={LEAD}>The problem isn&apos;t a lack of information.</p>
              <p className="text-base md:text-lg font-semibold leading-relaxed text-consulting-navy dark:text-[#F9FAFB]">
                It&apos;s knowing what evidence is actually strong enough to change your decision.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 · The core method */}
      <section id="method" className="scroll-mt-24 py-24 md:py-32 bg-consulting-navy dark:bg-[#020C1B]">
        <div className={CONTAINER}>
          <div className="max-w-2xl space-y-4">
            <Eyebrow onNavy>The core method</Eyebrow>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-white">
              Turn an idea into a decision.
            </h2>
            <p className="text-base md:text-lg text-white/70 leading-relaxed">
              Five stages, in order. Each one narrows what you believe down to what you can defend.
            </p>
          </div>

          <ol className="mt-16 grid grid-cols-1 lg:grid-cols-5">
            {METHOD.map((stage) => (
              <li
                key={stage.n}
                className="relative border-t border-white/15 pt-8 pb-10 lg:pb-0 lg:pr-6 lg:[&:not(:first-child)]:pl-6 lg:[&:not(:first-child)]:border-l lg:border-l-white/10"
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-[5px] left-0 lg:[li:not(:first-child)>&]:left-6 h-2.5 w-2.5 rounded-full bg-consulting-royal-light ring-4 ring-consulting-navy dark:ring-[#020C1B]"
                />
                <p className="text-[11px] font-mono tracking-[0.18em] text-blue-300">{stage.n}</p>
                <h3 className="mt-3 text-sm font-mono font-semibold uppercase tracking-[0.16em] text-white">
                  {stage.name}
                </h3>
                <div className="mt-4 space-y-2">
                  {stage.questions.map((q) => (
                    <p key={q} className="text-sm leading-relaxed text-white/70">
                      {q}
                    </p>
                  ))}
                </div>
                {stage.n === "05" && (
                  <div className="mt-4 grid grid-cols-2 gap-2 max-w-xs">
                    {VERDICTS.map((v) => (
                      <Verdict key={v} label={v} onNavy />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 · What you get */}
      <section className={SECTION_WHITE}>
        <div className={CONTAINER}>
          <div className="max-w-2xl space-y-4">
            <Eyebrow>What you get</Eyebrow>
            <h2 className={H2}>What the founding version gives you</h2>
          </div>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-200 dark:bg-white/10">
            {DELIVERABLES.map((item, idx) => {
              const isLast = idx === DELIVERABLES.length - 1;
              return (
                <div
                  key={item.title}
                  className={`bg-white dark:bg-[#0B1120] p-7 ${isLast ? "sm:col-span-2 lg:col-span-3" : ""}`}
                >
                  <p className="text-[11px] font-mono tracking-[0.18em] text-consulting-royal dark:text-blue-400">
                    {isLast ? "Throughout" : `0${idx + 1}`}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold tracking-[-0.01em] text-consulting-navy dark:text-[#F9FAFB]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-consulting-slate dark:text-slate-300 max-w-xl">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5 · Sample artifacts */}
      <section className={SECTION_CREAM}>
        <div className={CONTAINER}>
          <div className="max-w-2xl space-y-4">
            <Eyebrow>Sample artifacts</Eyebrow>
            <h2 className={H2}>Don&apos;t just read the framework. See the work.</h2>
            <p className={LEAD}>
              Three pages from a Validation File, filled in with example entries. They show the structure of the work
              — the entries are illustrative, not market benchmarks.
            </p>
          </div>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            <Artifact
              kind="Assumption Map"
              id="A-01"
              rows={[
                {
                  label: "Assumption",
                  value: "“Target users experience this problem often enough to seek a solution.”",
                },
                { label: "Evidence", value: <Unknown /> },
                { label: "Strength", value: "None yet" },
                {
                  label: "Risk",
                  value: <span className="font-semibold text-rose-700 dark:text-rose-300">High</span>,
                },
                {
                  label: "What would change my mind?",
                  value:
                    "10 qualified conversations with repeated problem language + at least 3 users willing to take a concrete next step.",
                },
              ]}
            />
            <Artifact
              kind="Test Card"
              id="T-01"
              rows={[
                { label: "Riskiest assumption", value: "People will pay for this solution." },
                { label: "Test", value: "Offer the founding version to qualified builders." },
                { label: "Pass condition", value: "At least 3 genuine purchases from qualified strangers." },
                {
                  label: "Kill / change condition",
                  value: "No meaningful willingness to pay after a defined outreach/test cycle.",
                },
              ]}
            />
            <Artifact
              kind="Decision Record"
              id="D-01"
              rows={[
                { label: "Assumption tested", value: "Target users will commit to a paid next step." },
                {
                  label: "Evidence",
                  value: "Problem described unprompted in several interviews. No paid commitment yet.",
                },
                { label: "Strength", value: "Moderate for the problem. None yet for payment." },
                { label: "Decision", value: <Verdict label="TEST MORE" /> },
                {
                  label: "Next test",
                  value: "Offer a paid pilot to the users who raised the problem. Decide again on the replies.",
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* 6 · Why this is different */}
      <section className={SECTION_WHITE}>
        <div className={CONTAINER}>
          <div className="max-w-2xl space-y-4">
            <Eyebrow>Why this is different</Eyebrow>
            <h2 className={H2}>Not another AI-generated idea score.</h2>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/15 p-7">
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-slate dark:text-slate-400">
                Generic AI validator
              </p>
              <div className="mt-6">
                <Flow steps={["Idea", "AI analysis", "Score", "Report"]} emphasis={false} />
              </div>
            </div>
            <div className="rounded-xl border border-consulting-royal/40 bg-consulting-royal/[0.03] dark:bg-consulting-royal/[0.06] p-7">
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-consulting-royal dark:text-blue-400">
                Validate Before You Build
              </p>
              <div className="mt-6">
                <Flow steps={["Idea", "Assumptions", "Evidence", "Falsifier", "Test", "Decision"]} emphasis />
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5 space-y-3">
              <p className={LEAD}>An AI can generate a convincing explanation for almost anything.</p>
              <p className="text-base md:text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB]">
                That doesn&apos;t make the explanation evidence.
              </p>
            </div>
            <div className="lg:col-span-7">
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-slate dark:text-slate-400">
                This system separates
              </p>
              <ol className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-200 dark:bg-white/10">
                {[
                  { label: "What you think", desc: "Assumptions, beliefs and AI-generated claims." },
                  { label: "What you know", desc: "Evidence with a source and a strength." },
                  { label: "What you need to test", desc: "The riskiest gap between the two." },
                ].map((col) => (
                  <li key={col.label} className="bg-white dark:bg-[#0B1120] p-5">
                    <p className="text-xs font-mono font-semibold uppercase tracking-[0.14em] text-consulting-navy dark:text-[#F9FAFB]">
                      {col.label}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-consulting-slate dark:text-slate-400">{col.desc}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm md:text-base leading-relaxed text-consulting-slate dark:text-slate-300">
                AI helps process and challenge the work.{" "}
                <span className="font-semibold text-consulting-navy dark:text-[#F9FAFB]">
                  It does not get to manufacture proof.
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7 · AI principle */}
      <section className={SECTION_CREAM}>
        <div className={`${CONTAINER} grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center`}>
          <div className="lg:col-span-7 space-y-6">
            <Eyebrow>The AI principle</Eyebrow>
            <h2 className={H2}>AI can challenge the idea. It can&apos;t become the evidence.</h2>
            <p className="text-sm font-semibold text-consulting-navy dark:text-[#F9FAFB]">Use AI to:</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {AI_USES.map((use) => (
                <li key={use} className="flex items-start gap-3 text-base text-consulting-slate dark:text-slate-300">
                  <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-consulting-royal" />
                  {use}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] p-8">
              <p className="text-xl md:text-2xl font-semibold tracking-[-0.01em] leading-snug text-consulting-navy dark:text-[#F9FAFB]">
                Don&apos;t use AI output as proof of demand.
              </p>
              <p className="mt-4 text-sm md:text-base leading-relaxed text-consulting-slate dark:text-slate-300">
                If a claim cannot be supported by actual evidence, mark it:
              </p>
              <p className="mt-6 inline-flex rounded-md border-2 border-dashed border-amber-600/50 dark:border-amber-400/50 px-4 py-2 text-lg font-mono font-semibold tracking-[0.18em] text-amber-700 dark:text-amber-300">
                UNKNOWN.
              </p>
              <p className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 text-xs font-mono uppercase tracking-[0.14em] text-consulting-slate dark:text-slate-400">
                This is a core principle of the product.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8 · Who it is for */}
      <section className={SECTION_WHITE}>
        <div className={CONTAINER}>
          <div className="max-w-2xl space-y-4">
            <Eyebrow>Who it is for</Eyebrow>
            <h2 className={H2}>Built for builders who are about to commit serious time.</h2>
          </div>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 p-7">
              <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-consulting-royal dark:text-blue-400">
                Good fit
              </h3>
              <ul className="mt-6 space-y-4">
                {GOOD_FIT.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-base text-consulting-navy dark:text-slate-200">
                    <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-consulting-royal" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-7">
              <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-consulting-slate dark:text-slate-400">
                Not the best fit
              </h3>
              <ul className="mt-6 space-y-4">
                {NOT_A_FIT.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-base text-consulting-slate dark:text-slate-400">
                    <Minus size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 9 · About the creator — public portfolio information only. */}
      <section className={SECTION_CREAM}>
        <div className={`${CONTAINER} grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-16 items-center`}>
          <div className="md:col-span-4">
            <div className="relative w-full max-w-[16rem] md:max-w-none aspect-[4/5] overflow-hidden rounded-sm">
              <Image
                src="/assets/profile-hero.jpg"
                alt="Shivam Chaturvedi"
                fill
                sizes="(min-width: 768px) 30vw, 16rem"
                className="object-cover grayscale-[8%] contrast-[1.03] saturate-[0.96]"
              />
            </div>
          </div>
          <div className="md:col-span-8 space-y-6">
            <Eyebrow>About the creator</Eyebrow>
            <h2 className={H2}>Built from an evidence-first research discipline.</h2>
            <div>
              <p className="text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB]">{SITE_CONFIG.name}</p>
              <p className="text-sm font-mono uppercase tracking-[0.14em] text-consulting-slate dark:text-slate-400">
                Strategic Research Consultant
              </p>
            </div>
            <p className={LEAD}>
              My work is strategic research: competitive intelligence, market intelligence, due diligence, market
              mapping and AI-assisted research. The discipline is the same every time — verify before asserting,
              triangulate before trusting, and say plainly what is still unknown.
            </p>
            <blockquote className="pl-6 border-l-2 border-consulting-royal text-lg md:text-xl font-medium leading-relaxed text-consulting-navy dark:text-[#F9FAFB]">
              &ldquo;I built this from the same evidence-first research discipline I use in strategic research — and
              I&apos;m applying it to product ideas.&rdquo;
            </blockquote>
            <p className="text-sm leading-relaxed text-consulting-slate dark:text-slate-400">
              Validate Before You Build is new. This founding version is its first release, and it will be shaped by
              the people who use it first.
            </p>
            <Link
              href="/#about"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-consulting-slate dark:text-slate-400 hover:text-consulting-royal dark:hover:text-consulting-royal transition-colors duration-200 ease-calm"
            >
              More about my research work
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* 10 · Founding version */}
      <section id="founding-version" className={`scroll-mt-24 ${SECTION_WHITE}`}>
        <div className={`${CONTAINER} grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start`}>
          <div className="lg:col-span-7 space-y-6">
            <Eyebrow>Founding version</Eyebrow>
            <h2 className={H2}>The Founding Version</h2>
            <div className={`space-y-4 ${LEAD}`}>
              <p>This is the first release of Validate Before You Build.</p>
              <p>The founding version is intentionally small.</p>
              <p>You submit your idea and the evidence you already have.</p>
              <p className="font-medium text-consulting-navy dark:text-slate-200">
                I prepare your initial Validation File manually and deliver it within 48 hours.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-consulting-navy dark:text-[#F9FAFB]">Your file focuses on:</p>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {FILE_FOCUS.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-base text-consulting-slate dark:text-slate-300">
                    <Check size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-consulting-royal" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-5 lg:sticky lg:top-28">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 sm:p-8 shadow-[0_8px_30px_-12px_rgba(10,25,47,0.18)]">
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-consulting-royal dark:text-blue-400">
                Founding Version
              </p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight tabular-nums text-consulting-navy dark:text-[#F9FAFB]">
                  $39
                </span>
                <span className="text-sm text-consulting-slate dark:text-slate-400">one-time</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-consulting-navy dark:text-slate-200">
                {["Manual Validation File for one idea", "Delivered within 48 hours of your submission", "Not a subscription"].map(
                  (line) => (
                    <li key={line} className="flex items-start gap-3">
                      <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-consulting-royal" />
                      {line}
                    </li>
                  )
                )}
              </ul>
              <BuyLink className={`${BTN_PRIMARY} mt-8 w-full`} />
              <p className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 text-sm leading-relaxed text-consulting-slate dark:text-slate-400">
                <span className="font-semibold text-consulting-navy dark:text-slate-200">7-day refund</span> if the
                delivered file doesn&apos;t provide a clear, useful decision about what to do next. The refund covers
                the usefulness of the file — no outcome for your idea is guaranteed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 11 · How it works */}
      <section className={SECTION_CREAM}>
        <div className={CONTAINER}>
          <div className="max-w-2xl space-y-4">
            <Eyebrow>How it works</Eyebrow>
            <h2 className={H2}>Three steps from idea to file.</h2>
          </div>
          <ol className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
            <li className="flex flex-col rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] p-7">
              <p className="text-3xl font-semibold tabular-nums text-consulting-royal">01</p>
              <h3 className="mt-4 text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB]">Submit your idea</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-consulting-slate dark:text-slate-300">
                Tell us what you&apos;re building, who it&apos;s for, what you&apos;ve already done and what evidence
                you have.
              </p>
              <BuyLink className={`${BTN_PRIMARY} mt-6 w-full`}>Get Started — $39</BuyLink>
            </li>
            <li className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] p-7">
              <p className="text-3xl font-semibold tabular-nums text-consulting-royal">02</p>
              <h3 className="mt-4 text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB]">
                Your Validation File is prepared
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-consulting-slate dark:text-slate-300">
                The idea is structured around assumptions, evidence, risk, falsifiers and the cheapest useful test.
              </p>
            </li>
            <li className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1120] p-7">
              <p className="text-3xl font-semibold tabular-nums text-consulting-royal">03</p>
              <h3 className="mt-4 text-lg font-semibold text-consulting-navy dark:text-[#F9FAFB]">Receive your file</h3>
              <p className="mt-2 text-sm leading-relaxed text-consulting-slate dark:text-slate-300">
                Delivered manually within 48 hours of your submission.
              </p>
            </li>
          </ol>
          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-dashed border-slate-300 dark:border-white/15 p-6">
            <p className="flex-1 text-sm leading-relaxed text-consulting-slate dark:text-slate-300">
              <span className="font-semibold text-consulting-navy dark:text-[#F9FAFB]">After purchase,</span> submit
              your idea and the evidence you already have through the submission form.
            </p>
            <TallyLink className={`${BTN_OUTLINE} w-full sm:w-auto`} />
          </div>
        </div>
      </section>

      {/* 12 · FAQ */}
      <section className={SECTION_WHITE}>
        <div className="max-w-3xl mx-auto px-6">
          <div className="space-y-4">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className={H2}>Questions, answered plainly.</h2>
          </div>
          <div className="mt-12 border-t border-slate-200 dark:border-white/10">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group border-b border-slate-200 dark:border-white/10">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base md:text-lg font-medium text-consulting-navy dark:text-[#F9FAFB] [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-consulting-royal/60 rounded">
                  {faq.q}
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-consulting-slate transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="pb-6 pr-10 text-base leading-relaxed text-consulting-slate dark:text-slate-300">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 13 · Final CTA */}
      <section className="py-24 md:py-32 bg-consulting-navy dark:bg-[#020C1B]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-white text-balance">
            Before you build the next thing, find out what needs to be true.
          </h2>
          <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-left">
            {["One idea.", "One riskiest assumption.", "One cheap test.", "One clearer decision."].map((line) => (
              <li key={line} className="bg-consulting-navy dark:bg-[#020C1B] px-5 py-4 text-sm font-medium text-white/80">
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-col items-center gap-5">
            <BuyLink className={`${BTN_ON_NAVY} w-full sm:w-auto`} />
            <p className="text-sm text-white/60">
              Already purchased?{" "}
              <TallyLink className="inline-flex items-center gap-1 font-semibold text-white underline underline-offset-4 decoration-white/30 hover:decoration-white transition-colors" />
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
