import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "info"
  | "progress"
  | "special"
  | "success"
  | "neutral"
  | "danger";

const variants: Record<BadgeVariant, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  progress: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  special: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  neutral: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
};

const dotColors: Record<BadgeVariant, string> = {
  info: "bg-blue-400",
  progress: "bg-amber-400",
  special: "bg-purple-400",
  success: "bg-emerald-400",
  neutral: "bg-slate-400",
  danger: "bg-red-400",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Show a leading status dot. */
  dot?: boolean;
}

export function Badge({ variant = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dotColors[variant])} aria-hidden />}
      {children}
    </span>
  );
}
