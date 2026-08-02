import { LoadingState } from "@/components/admin/ui";

export default function ResumeAiLoading() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <LoadingState variant="card" />
    </div>
  );
}
