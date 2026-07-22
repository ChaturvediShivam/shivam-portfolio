"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { InquiryNote } from "@/types/inquiry";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotesPanel({ inquiryId, notes }: { inquiryId: string; notes: InquiryNote[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/inquiries/${inquiryId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (!res.ok) throw new Error();
      setBody("");
      router.refresh();
    } catch {
      setError("Failed to add note.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add an internal note — only visible here, never to the visitor."
          className="w-full px-3 py-2 rounded-md border border-white/10 bg-white/[0.03] text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !body.trim()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-[#0B0E14] text-xs font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            Add note
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>

      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-slate-600">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-sm text-slate-200 leading-relaxed">{note.body}</p>
              <p className="text-xs text-slate-600 mt-1.5">{formatTimestamp(note.created_at)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
