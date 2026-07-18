import { formatCurrency } from "../../utils/formatters";

// Cifras financieras en monospace (sección 3: JetBrains Mono para valores).
export default function MonoAmount({
  value,
  className = "",
}: {
  value: number | null | undefined;
  className?: string;
}) {
  return <span className={`font-mono tabular-nums ${className}`}>{formatCurrency(value)}</span>;
}
