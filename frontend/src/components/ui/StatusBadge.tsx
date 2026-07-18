// Badge de estado de pago — sección 3: border-radius 20px, colores semánticos.
export type Estado = "pagado" | "pendiente" | "atrasado";

const MAP: Record<Estado, { label: string; className: string }> = {
  pagado: { label: "Pagado", className: "bg-estado-pagado/12 text-estado-pagado" },
  pendiente: { label: "Pendiente", className: "bg-estado-pendiente/15 text-estado-pendiente" },
  atrasado: { label: "Atrasado", className: "bg-estado-atrasado/12 text-estado-atrasado" },
};

export default function StatusBadge({ estado }: { estado: Estado }) {
  const { label, className } = MAP[estado];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-etiqueta font-medium uppercase tracking-wide ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
