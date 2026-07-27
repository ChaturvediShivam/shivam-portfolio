import { Skeleton } from "@/components/admin/ui";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
      <Skeleton className="h-32 rounded-lg" />
    </div>
  );
}
