import { LoadingState, Skeleton } from "@/components/admin/ui";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-full sm:w-80" />
      <LoadingState variant="table" />
    </div>
  );
}
