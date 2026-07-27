"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Renders a message body. `html` is ALREADY sanitized server-side
 * (lib/messages.sanitizeMessageHtml) before being passed here — this component
 * never sanitizes and never receives raw HTML.
 */
export function MessageBody({ html, text }: { html: string | null; text: string | null }) {
  const hasHtml = !!html && html.trim() !== "";
  const hasText = !!text && text.trim() !== "";
  const [mode, setMode] = React.useState<"html" | "text">(hasHtml ? "html" : "text");

  if (!hasHtml && !hasText) {
    return <p className="text-sm text-slate-500">No message body.</p>;
  }

  return (
    <div>
      {hasHtml && hasText && (
        <div className="mb-3 inline-flex items-center rounded-md border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="Body format">
          {(["html", "text"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                mode === m ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white",
              )}
            >
              {m === "html" ? "Formatted" : "Plain text"}
            </button>
          ))}
        </div>
      )}

      {mode === "html" && hasHtml ? (
        <div
          className="max-w-none text-sm leading-relaxed text-slate-200 [&_a]:text-blue-400 [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_img]:max-w-full [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/30 [&_pre]:p-2 [&_table]:block [&_table]:overflow-x-auto [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html as string }}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-200">
          {text ?? ""}
        </pre>
      )}
    </div>
  );
}
