import { PageHeader } from "@/components/admin/ui";
import { ResumeAiWorkspace } from "@/components/admin/resume-ai/ResumeAiWorkspace";
import { featureEnabled } from "@/lib/featureFlags";

/**
 * Resume AI.
 *
 * A Server Component shell around a client workspace, matching every other
 * admin module: the page owns layout and metadata, the interactive part owns
 * state.
 *
 * The AI flag is read here and passed down. Feature flags are server-only by
 * design, and the client needs to know whether to run the review at all — so
 * the answer travels as a prop rather than the flag travelling to the browser.
 */

export const metadata = { title: "Resume AI" };

export default function ResumeAiPage() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Resume AI"
        description="Analyze your resume against any job description using AI."
      />
      <ResumeAiWorkspace aiEnabled={featureEnabled("FEATURE_RESUME_AI")} />
    </div>
  );
}
