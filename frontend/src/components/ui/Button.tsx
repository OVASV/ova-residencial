import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sidebar-accent text-white hover:opacity-90",
  secondary: "border-[0.5px] border-black/20 bg-white text-ink hover:bg-black/5",
  ghost: "text-black/55 hover:bg-black/5 hover:text-ink",
  danger: "border-[0.5px] border-estado-atrasado/40 text-estado-atrasado hover:bg-estado-atrasado/10",
};

export default function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-base font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
