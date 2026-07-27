import { LoadingState } from "@/components/admin/ui";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <LoadingState variant="detail" />
    </div>
  );
}
