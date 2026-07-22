"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteInquiryButton({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/inquiries/${inquiryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/admin");
      router.refresh();
    } catch {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Delete permanently?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="px-2.5 py-1 rounded-md text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
    >
      <Trash2 size={12} />
      Delete
    </button>
  );
}
