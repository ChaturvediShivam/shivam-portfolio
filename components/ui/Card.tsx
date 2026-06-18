import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Card = ({ className, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        "p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-consulting-navy-light transition-all duration-300 shadow-sm hover:shadow-md hover:border-consulting-royal",
        className
      )}
      {...props}
    />
  );
};
