import { useMemo, useState } from "react";
import { formatHM } from "@/lib/tiempo";

export interface FilaPrecio {
  key: string;
  tipo: "clase" | "1a1";
  refId: string;
  profesorId: string;
  profesor: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  detalle: string;
  monto: number;
}

/**
 * Resumen informativo de la actividad del mes.
 *
 * Se conserva la misma firma del componente para no alterar la pantalla de Pagos,
 * pero aquí ya no se asignan ni se guardan valores por clase/sesión. El pago se
 * calcula en el resumen económico con la tarifa por hora y la duración registrada.
 */
export function PagosPrecios({ filas }: {
  filas: FilaPrecio[];
  mes: number;
  anio: number;
  puedeEditar: boolean;
  onRefresh: () => void;
}) {
  const [filtro, setFiltro] = useState("");

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      (f.profesor + " " + f.detalle + " " + f.fecha + " " + f.tipo)
        .toLowerCase()
        .includes(q),
    );
  }, [filas, filtro]);

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Clases y sesiones del mes</h2>
          <p className="text-xs text-muted-foreground">
            Resumen de la actividad realizada. Aquí no se asignan valores por clase o sesión.
          </p>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar profesor, estudiante o tema…"
          className="px-3 py-2 rounded-lg border bg-background text-sm w-full sm:w-72"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-2 py-2 font-semibold">Fecha</th>
              <th className="text-left px-2 py-2 font-semibold">Horario</th>
              <th className="text-left px-2 py-2 font-semibold">Duración</th>
              <th className="text-left px-2 py-2 font-semibold">Tipo</th>
              <th className="text-left px-2 py-2 font-semibold">Profesor</th>
              <th className="text-left px-2 py-2 font-semibold">Alumna / Tema</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.key} className="border-t">
                <td className="px-2 py-2 whitespace-nowrap">
                  {new Date(f.fecha + "T00:00:00").toLocaleDateString("es-EC", {
                    day: "2-digit",
                    month: "short",
                  })}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {f.horaInicio.slice(0, 5)}
                  {f.horaFin ? ` – ${f.horaFin.slice(0, 5)}` : ""}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {f.minutos > 0 ? formatHM(f.minutos) : "Pendiente"}
                </td>
                <td className="px-2 py-2">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: f.tipo === "clase" ? "rgba(124,107,255,.12)" : "rgba(34,197,94,.12)",
                      color: f.tipo === "clase" ? "var(--violet)" : "#16a34a",
                    }}
                  >
                    {f.tipo === "clase" ? "Clase en vivo" : "1 a 1"}
                  </span>
                </td>
                <td className="px-2 py-2">{f.profesor}</td>
                <td className="px-2 py-2">{f.detalle}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  Sin clases ni sesiones este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
