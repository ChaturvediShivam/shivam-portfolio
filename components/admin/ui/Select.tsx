import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "./TextInput";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options: SelectOption[];
  /** Optional leading placeholder option (empty value). */
  placeholder?: string;
}

/**
 * Native <select> styled for the admin surface. Native is used for robustness
 * and built-in accessibility; use EntityPicker/Combobox for searchable sets.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, options, placeholder, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(fieldClasses(invalid, className), "appearance-none pr-9 [&>option]:bg-[#0B0E14]")}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        aria-hidden
      />
    </div>
  );
});
