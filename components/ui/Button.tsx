import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  href?: string;
  external?: boolean;
}

export const Button = ({
  variant = "primary",
  size = "md",
  className,
  href,
  external,
  children,
  ...props
}: ButtonProps) => {
  const variants = {
    primary: "bg-consulting-royal text-white hover:bg-consulting-royal-dark shadow-sm",
    outline: "border-2 border-consulting-slate text-consulting-slate hover:border-consulting-royal hover:text-consulting-royal dark:border-slate-700 dark:text-slate-400",
    ghost: "text-consulting-slate hover:text-consulting-royal dark:text-slate-400 dark:hover:text-consulting-royal",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg font-semibold",
  };

  const classes = cn(
    "inline-flex items-center justify-center rounded-lg transition-all duration-200 active:scale-95 font-medium",
    variants[variant],
    sizes[size],
    className
  );

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
};
