"use client";

import * as React from "react";
import { ResumeUploader } from "./ResumeUploader";
import { JDUploader } from "./JDUploader";
import { AnalyzeButton } from "./AnalyzeButton";
import { isJobDescriptionReady, MIN_JD_CHARS, type JobDescriptionInput } from "@/types/job-description";
import type { UploadedDocument } from "@/types/upload";

/**
 * Resume AI workspace (Resume AI · Step 1).
 *
 * The single stateful container. Both uploaders are controlled from here, which
 * is what lets the Analyze button know whether it can run without either
 * uploader knowing the other exists.
 *
 * State is intentionally local and unpersisted. Nothing is uploaded, stored, or
 * sent anywhere in Step 1 — a reload clears the form, which is the honest
 * behaviour while there is no durable store to reload from. The step that adds
 * one replaces this state, not the components under it.
 */

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-xs font-medium text-slate-400"
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-white">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function ResumeAiWorkspace() {
  const [resume, setResume] = React.useState<UploadedDocument | null>(null);
  const [jobDescription, setJobDescription] = React.useState<JobDescriptionInput | null>(null);

  const jdReady = isJobDescriptionReady(jobDescription);
  const ready = resume !== null && jdReady;

  // Named precisely rather than "complete both steps": telling someone what is
  // missing is the difference between a hint and a hint they can act on.
  const blockedReason = React.useMemo(() => {
    if (!resume && !jdReady) return "Upload a resume and add a job description to continue.";
    if (!resume) return "Upload a resume to continue.";
    if (jobDescription?.source === "paste") {
      return `The job description needs at least ${MIN_JD_CHARS} characters.`;
    }
    return "Add a job description to continue.";
  }, [resume, jdReady, jobDescription]);

  return (
    <div className="space-y-4">
      <Section
        step={1}
        title="Resume"
        description="PDF or DOCX, up to 10 MB. Nothing leaves your browser yet."
      >
        <ResumeUploader onChange={setResume} />
      </Section>

      <Section
        step={2}
        title="Job description"
        description="Paste the text or upload the posting — whichever you have."
      >
        <JDUploader onChange={setJobDescription} />
      </Section>

      <Section
        step={3}
        title="Analyze"
        description="Compare the resume against the role and see where it stands."
      >
        {/*
          No handler in Step 1. The button is fully wired for state — enabled,
          disabled, loading — so the step that adds analysis supplies `onAnalyze`
          and `loading` and changes nothing else here.
        */}
        <AnalyzeButton ready={ready} blockedReason={blockedReason} />
        <p className="mt-3 text-xs text-slate-600">
          Analysis is not available yet — this step is the upload flow only.
        </p>
      </Section>
    </div>
  );
}
