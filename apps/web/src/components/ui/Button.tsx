import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink border-ink shadow-comic-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50",
  secondary:
    "bg-surface text-ink border-ink shadow-comic-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50",
  ghost: "text-ink-muted border-transparent hover:text-ink hover:bg-surface-raised disabled:opacity-50",
  danger: "bg-danger text-white border-ink shadow-comic-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`focus-ring inline-flex items-center justify-center rounded-md border-2 font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
