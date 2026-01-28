import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  fullWidth?: boolean;
}

export function ActionButton({ 
  children, 
  className, 
  variant = "primary", 
  fullWidth = false,
  ...props 
}: ActionButtonProps) {
  
  const variants = {
    primary: "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98]",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]",
    outline: "bg-transparent border-2 border-border text-foreground hover:bg-secondary/50 active:scale-[0.98]",
    danger: "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25 hover:bg-destructive/90 active:scale-[0.98]",
    ghost: "bg-transparent text-foreground hover:bg-secondary/50",
  };

  return (
    <button
      className={cn(
        "h-14 px-8 rounded-2xl font-semibold text-lg transition-all duration-200 ease-out touch-target flex items-center justify-center gap-2",
        variants[variant],
        fullWidth ? "w-full" : "",
        "disabled:opacity-50 disabled:pointer-events-none disabled:transform-none",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
