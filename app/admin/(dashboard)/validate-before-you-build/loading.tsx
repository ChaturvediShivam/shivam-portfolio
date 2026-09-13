import { LoadingState, Skeleton } from "@/components/admin/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <LoadingState variant="table" />
    </div>
  );
}
