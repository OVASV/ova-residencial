// Formateadores compartidos (sección 10: utils/formatters.ts).

// Moneda del sistema: dólares (USD) → "$1,234.00".
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export const formatCurrency = (n: number | null | undefined): string =>
  currencyFmt.format(n ?? 0);

const dateFmt = new Intl.DateTimeFormat("es-GT", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

export const formatDate = (d: string | Date | null | undefined): string =>
  d ? dateFmt.format(new Date(d)) : "—";

// Extrae lat/lng de texto: "14.6349, -90.5069" o un link de Google Maps
// (formatos @lat,lng / !3dlat!4dlng / ?q=lat,lng). Devuelve null si no es válido.
export function parseCoords(input: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const text = input.trim();
  const num = "(-?\\d+(?:\\.\\d+)?)";
  const bang = new RegExp(`!3d${num}!4d${num}`).exec(text);
  const at = new RegExp(`@${num},${num}`).exec(text);
  const q = new RegExp(`[?&](?:q|ll|query|destination)=${num},${num}`).exec(text);
  const plain = new RegExp(`^${num}\\s*[, ]\\s*${num}$`).exec(text);
  const m = bang || at || q || plain;
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Iniciales para avatares (máx. 2 letras).
export const initials = (nombre: string | null | undefined): string =>
  (nombre ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
