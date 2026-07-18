import { useRef, useState } from "react";
import { IconPaperclip, IconPhoto, IconFileTypePdf, IconTrash } from "@tabler/icons-react";

// Celda reutilizable: muestra el comprobante (ver/quitar) o permite adjuntarlo.
export default function ComprobanteCell({
  url,
  tipo,
  onSubir,
  onQuitar,
}: {
  url?: string | null;
  tipo?: string | null;
  onSubir: (file: File) => Promise<void>;
  onQuitar: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await onSubir(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  if (url) {
    return (
      <div className="flex items-center gap-1.5">
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sidebar-accent hover:underline" title="Ver comprobante">
          {tipo === "pdf" ? <IconFileTypePdf size={16} /> : <IconPhoto size={16} />} ver
        </a>
        <button
          onClick={async () => {
            if (!confirm("¿Quitar el comprobante?")) return;
            setBusy(true);
            try {
              await onQuitar();
            } finally {
              setBusy(false);
            }
          }}
          className="text-black/30 hover:text-estado-atrasado"
          aria-label="Quitar comprobante"
        >
          <IconTrash size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1 text-black/40 hover:text-sidebar-accent"
        title="Adjuntar comprobante (imagen o PDF)"
      >
        <IconPaperclip size={15} /> {busy ? "subiendo…" : "adjuntar"}
      </button>
      {error && <span className="ml-1 text-etiqueta text-estado-atrasado">{error}</span>}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={pick} className="hidden" />
    </>
  );
}
