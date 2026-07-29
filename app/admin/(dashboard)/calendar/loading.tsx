import { LoadingState } from "@/components/admin/ui";

export default function CalendarLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <LoadingState />
    </div>
  );
}
