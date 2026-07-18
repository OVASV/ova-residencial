import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChevronRight } from "@tabler/icons-react";
import MonoAmount from "./MonoAmount";

type Tone = "default" | "pagado" | "pendiente" | "atrasado";

const TONE: Record<Tone, string> = {
  default: "text-ink",
  pagado: "text-estado-pagado",
  pendiente: "text-estado-pendiente",
  atrasado: "text-estado-atrasado",
};

export default function KpiCard({
  label,
  value,
  tone = "default",
  icon,
  sub,
  subValue,
  subLabel,
  mode = "cobro",
  href,
  linkLabel = "Ver detalle",
  newTab = false,
}: {
  label: string;
  value: number;
  tone?: Tone;
  icon?: ReactNode;
  sub?: string;
  subValue?: number;
  subLabel?: string;
  /** "cobro": falta cobrar (rojo si falta). "gasto": vs presupuesto (rojo si excede). */
  mode?: "cobro" | "gasto";
  href?: string;
  linkLabel?: string;
  /** Abre el link en una pestaña nueva (p. ej. reporte PDF). */
  newTab?: boolean;
}) {
  const pct = subValue && subValue > 0 ? Math.round((value / subValue) * 100) : null;
  const diff = subValue !== undefined ? Math.round((subValue - value) * 100) / 100 : null;

  // cobro: diff>0 = falta por cobrar (rojo). gasto: diff<0 = excede presupuesto (rojo).
  let diffText: string | null = null;
  let diffColor = "";
  if (diff !== null) {
    if (mode === "gasto") {
      diffColor = diff < -0.005 ? "text-estado-atrasado" : "text-estado-pagado";
      diffText = diff < -0.005 ? "Excede" : "Disponible";
    } else {
      diffColor = diff > 0.005 ? "text-estado-atrasado" : "text-estado-pagado";
      diffText = "Falta";
    }
  }

  return (
    <div className="rounded-lg border-[0.5px] border-black/15 bg-white p-3.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-etiqueta uppercase tracking-wide text-black/45">{label}</span>
        {icon && <span className="text-black/25">{icon}</span>}
      </div>
      <MonoAmount value={value} className={`text-lg font-semibold ${TONE[tone]}`} />
      {subValue !== undefined && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-etiqueta text-black/40">
          <span>{subLabel ?? "Esperado"}: <MonoAmount value={subValue} className="font-mono" /></span>
          {diff !== null && (
            <span className={`font-semibold ${diffColor}`}>
              · {diffText} <MonoAmount value={Math.abs(diff)} className="font-mono" />
              {pct !== null && ` (${pct}%)`}
            </span>
          )}
        </div>
      )}
      {sub && <div className="mt-1 text-etiqueta text-black/40">{sub}</div>}
      {href && (
        newTab ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-0.5 text-etiqueta font-medium text-sidebar-accent hover:underline"
          >
            {linkLabel} <IconChevronRight size={14} />
          </a>
        ) : (
          <Link
            to={href}
            className="mt-2 inline-flex items-center gap-0.5 text-etiqueta font-medium text-sidebar-accent hover:underline"
          >
            {linkLabel} <IconChevronRight size={14} />
          </Link>
        )
      )}
    </div>
  );
}
