import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md bg-white/[0.03] border px-3 py-2 text-sm text-slate-200 " +
  "placeholder:text-slate-600 transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus:border-white/20 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

/** Shared input surface classes (reused by TextInput / Textarea / Select). */
export function fieldClasses(invalid?: boolean, className?: string) {
  return cn(fieldBase, invalid ? "border-red-500/40" : "border-white/10", className);
}

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, className, ...props },
  ref,
) {
  return <input ref={ref} className={fieldClasses(invalid, className)} {...props} />;
});
