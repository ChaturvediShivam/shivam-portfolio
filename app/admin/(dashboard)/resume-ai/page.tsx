import { PageHeader } from "@/components/admin/ui";
import { ResumeAiWorkspace } from "@/components/admin/resume-ai/ResumeAiWorkspace";

/**
 * Resume AI (Step 1 — upload flow only).
 *
 * A Server Component shell around a client workspace, matching every other
 * admin module: the page owns layout and metadata, the interactive part owns
 * state. There is no data to fetch yet, so nothing is awaited here.
 */

export const metadata = { title: "Resume AI" };

export default function ResumeAiPage() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Resume AI"
        description="Analyze your resume against any job description using AI."
      />
      <ResumeAiWorkspace />
    </div>
  );
}
