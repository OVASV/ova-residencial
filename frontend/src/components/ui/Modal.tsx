import type { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";

// Modal centrado simple (sin librerías externas).
export default function Modal({
  title,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {/* El clic fuera del panel NO cierra: solo se cierra con la X o los botones. */}
      <div className={`w-full ${width} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b-[0.5px] border-black/10 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-black/40 hover:text-ink" aria-label="Cerrar">
            <IconX size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
