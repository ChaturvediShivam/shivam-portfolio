"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAD_SOURCES, type LeadSource } from "@/types/inquiry";

export function LeadSourceSelect({
  inquiryId,
  leadSource,
}: {
  inquiryId: string;
  leadSource: LeadSource;
}) {
  const router = useRouter();
  const [value, setValue] = useState(leadSource);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function handleChange(newSource: LeadSource) {
    setError("");
    const previous = value;
    setValue(newSource);

    try {
      const res = await fetch(`/api/admin/inquiries/${inquiryId}/lead-source`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadSource: newSource }),
      });

      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setValue(previous);
      setError("Failed to update lead source.");
    }
  }

  return (
    <div>
      <select
        value={value}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value as LeadSource)}
        className="px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60"
      >
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s} className="bg-[#0B0E14]">
            {s}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
