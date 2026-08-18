import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PROJECTS, SITE_CONFIG } from "@/constants";

/**
 * Project case study.
 *
 * A Server Component with no client JavaScript: this page is read, not
 * interacted with, and it is the page most likely to be opened on a phone from
 * a link in an application. `generateStaticParams` prerenders every project at
 * build time, so it is served as static HTML.
 *
 * The section order is the order an engineer reads in: what was the problem,
 * what did you build, how is it put together, what did you decide and why, what
 * went wrong, what came of it. Interview talking points come last — they are
 * the honest admission that this page exists to be discussed in a conversation.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

function findProject(slug: string) {
  return PROJECTS.find((p) => p.slug === slug);
}

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = findProject(slug);
  if (!project) return { title: "Project not found" };

  const title = `${project.name} — ${project.tagline}`;
  const url = `${SITE_CONFIG.url}/projects/${project.slug}`;

  return {
    title,
    description: project.problem,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: project.problem,
      url,
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description: project.problem },
  };
}

/** Section heading — one definition so every block on the page aligns. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-consulting-royal dark:text-blue-400 font-semibold">
      {children}
    </h2>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const project = findProject(slug);
  if (!project) notFound();

  const prose = "text-base text-consulting-slate dark:text-slate-300 leading-relaxed";

  return (
    <article className="bg-white dark:bg-[#0B1120]">
      <div className="max-w-3xl mx-auto px-6 py-20 md:py-28">
        <Link
          href="/#projects"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-consulting-slate/80 dark:text-slate-400 hover:text-consulting-royal transition-colors duration-200"
        >
          <ArrowLeft
            size={15}
            className="transition-transform duration-200 group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          All projects
        </Link>

        <header className="mt-10 space-y-5">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.1] text-consulting-navy dark:text-[#F9FAFB]">
            {project.name}
          </h1>
          <p className="text-lg md:text-xl text-consulting-slate dark:text-slate-300 leading-relaxed">
            {project.tagline}
          </p>

          <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-2 text-[11px] font-mono uppercase tracking-[0.12em] text-consulting-slate/70 dark:text-slate-400/70">
            <div>
              <dt className="sr-only">Role</dt>
              <dd>{project.role}</dd>
            </div>
            <div>
              <dt className="sr-only">Period</dt>
              <dd>{project.period}</dd>
            </div>
            <div>
              <dt className="sr-only">Status</dt>
              <dd>{project.status}</dd>
            </div>
          </dl>

          {project.liveUrl && (
            <div className="pt-2">
              <a
                href={project.liveUrl}
                target={project.liveUrl.startsWith("http") ? "_blank" : undefined}
                rel={project.liveUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-consulting-royal hover:text-consulting-royal-dark transition-colors duration-200"
              >
                {project.liveLabel}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          )}
        </header>

        <div className="mt-14 space-y-14">
          <Section title="Problem">
            <p className={prose}>{project.problem}</p>
          </Section>

          <Section title="Solution">
            <p className={prose}>{project.solution}</p>
          </Section>

          <Section title="What I built">
            <ul className="space-y-3">
              {project.built.map((item) => (
                <li key={item} className={`${prose} flex gap-3`}>
                  <span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-consulting-royal" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Architecture">
            <p className={prose}>{project.architecture}</p>
          </Section>

          {project.aiImplementation && (
            <Section title="AI implementation">
              <p className={prose}>{project.aiImplementation}</p>
            </Section>
          )}

          <Section title="Tech stack">
            <ul className="flex flex-wrap gap-2">
              {project.stack.map((tech) => (
                <li
                  key={tech}
                  className="rounded-md bg-[#FBF8F2] dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 px-3 py-1.5 text-sm text-consulting-slate dark:text-slate-300"
                >
                  {tech}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Key technical decisions">
            <div className="space-y-8">
              {project.decisions.map((d) => (
                <div key={d.title} className="space-y-2">
                  <h3 className="text-lg font-semibold tracking-[-0.01em] text-consulting-navy dark:text-[#F9FAFB]">
                    {d.title}
                  </h3>
                  <p className={prose}>{d.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Challenges">
            <div className="space-y-8">
              {project.challenges.map((c) => (
                <div key={c.title} className="space-y-2">
                  <h3 className="text-lg font-semibold tracking-[-0.01em] text-consulting-navy dark:text-[#F9FAFB]">
                    {c.title}
                  </h3>
                  <p className={prose}>{c.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Outcome">
            <p className={prose}>{project.outcome}</p>
          </Section>

          <Section title="Interview talking points">
            <ul className="space-y-3">
              {project.talkingPoints.map((point) => (
                <li key={point} className={`${prose} flex gap-3`}>
                  <span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-consulting-royal" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <footer className="mt-20 pt-10 border-t border-slate-200 dark:border-white/10 flex flex-wrap gap-x-8 gap-y-3">
          <Link
            href="/#projects"
            className="text-sm font-semibold text-consulting-royal hover:text-consulting-royal-dark transition-colors duration-200"
          >
            All projects
          </Link>
          <a
            href={SITE_CONFIG.resumeUrl}
            download="Shivam-Chaturvedi-CV.pdf"
            className="text-sm font-medium text-consulting-slate/80 dark:text-slate-400 hover:text-consulting-royal transition-colors duration-200"
          >
            Download CV
          </a>
          <Link
            href="/#contact"
            className="text-sm font-medium text-consulting-slate/80 dark:text-slate-400 hover:text-consulting-royal transition-colors duration-200"
          >
            Get in touch
          </Link>
        </footer>
      </div>
    </article>
  );
}
