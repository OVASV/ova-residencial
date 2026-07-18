import type { ReactNode } from "react";

// Estado vacío reutilizable (mientras los módulos de datos llegan en sprints posteriores).
export default function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-black/20">{icon}</div>}
      <div className="text-base text-black/55">{title}</div>
      {hint && <div className="max-w-sm text-etiqueta uppercase tracking-wide text-black/35">{hint}</div>}
    </div>
  );
}
