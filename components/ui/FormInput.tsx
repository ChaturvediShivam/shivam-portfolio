"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const FormInput = ({ label, error, className, ...props }: FormInputProps) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-semibold dark:text-slate-300">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 outline-none focus:ring-2 focus:ring-consulting-royal transition-all dark:text-white",
          error && "border-red-500 focus:ring-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
