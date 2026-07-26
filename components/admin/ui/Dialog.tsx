"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted, useOverlay } from "./useOverlay";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md";
  footer?: React.ReactNode;
  /** Hide the header close button (e.g. blocking confirmations). */
  hideClose?: boolean;
  children?: React.ReactNode;
}

/** Centered modal for short, focused tasks and confirmations. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  hideClose,
  children,
}: DialogProps) {
  const mounted = useMounted();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  useOverlay(open, onClose, panelRef);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-lg border border-white/10 bg-[#0B0E14] shadow-2xl shadow-black/40 outline-none",
          size === "sm" ? "max-w-sm" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-white">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-xs text-slate-400">
                {description}
              </p>
            )}
          </div>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-slate-400 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {children && <div className="px-5 py-4 text-sm text-slate-300">{children}</div>}

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
