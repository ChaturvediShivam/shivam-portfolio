import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: string;
  /** id of the control; also used to wire the <label>. */
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  /** A single control element (input/textarea/select). */
  children: React.ReactElement;
}

/**
 * Label + control + hint/error wrapper. Injects `id`, `aria-invalid`, and
 * `aria-describedby` into the child control so accessibility is automatic.
 */
export function FormField({ label, htmlFor, required, hint, error, className, children }: FormFieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id: htmlFor,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    invalid: error ? true : (children.props as { invalid?: boolean }).invalid,
  } as Record<string, unknown>);

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm text-slate-300">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
