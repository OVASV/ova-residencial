import { IconTool } from "@tabler/icons-react";
import EmptyState from "../components/ui/EmptyState";

// Página puente para módulos definidos en el documento pero aún no implementados.
export default function EnConstruccion({
  titulo,
  sprint,
}: {
  titulo: string;
  sprint: string;
}) {
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{titulo}</h1>
      <div className="rounded-lg border-[0.5px] border-black/15 bg-white shadow-sm">
        <EmptyState
          icon={<IconTool size={30} stroke={1.5} />}
          title={`Módulo "${titulo}" en construcción`}
          hint={sprint}
        />
      </div>
    </div>
  );
}
