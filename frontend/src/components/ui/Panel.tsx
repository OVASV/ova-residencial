import type { ReactNode } from "react";

// Contenedor blanco estándar con título de etiqueta (sección 3).
export default function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border-[0.5px] border-black/15 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b-[0.5px] border-black/10 px-4 py-2.5">
          {title && (
            <h2 className="text-etiqueta uppercase tracking-wide text-black/50">{title}</h2>
          )}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
