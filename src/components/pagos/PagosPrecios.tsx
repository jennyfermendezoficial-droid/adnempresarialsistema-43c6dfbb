import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { formatHM } from "@/lib/tiempo";

export type TipoFilaPago = "clase" | "1a1_laboral" | "1a1_fuera" | "1a1_pendiente" | "coach";

export interface FilaPrecio {
  key: string;
  tipo: TipoFilaPago;
  refId: string;
  profesorId: string;
  profesor: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  detalle: string;
  tema: string;
  monto: number;
}

const ETIQUETAS: Record<TipoFilaPago, string> = {
  clase: "Clases en vivo",
  "1a1_laboral": "Sesiones 1 a 1 · horario laboral",
  "1a1_fuera": "Sesiones 1 a 1 · fuera de horario laboral",
  "1a1_pendiente": "Sesiones 1 a 1 · duración pendiente",
  coach: "Coach",
};

const ORDEN: TipoFilaPago[] = ["clase", "1a1_laboral", "1a1_fuera", "coach", "1a1_pendiente"];

function colorTipo(tipo: TipoFilaPago) {
  if (tipo === "clase") return { fondo: "rgba(124,107,255,.12)", texto: "var(--violet)" };
  if (tipo === "1a1_laboral") return { fondo: "rgba(34,197,94,.12)", texto: "#16a34a" };
  if (tipo === "1a1_fuera") return { fondo: "rgba(245,158,11,.14)", texto: "#d97706" };
  if (tipo === "coach") return { fondo: "rgba(14,165,233,.12)", texto: "#0284c7" };
  return { fondo: "rgba(148,163,184,.15)", texto: "#64748b" };
}

export function PagosPrecios({ filas, mes, anio, onDescargarInforme }: {
  filas: FilaPrecio[];
  mes: number;
  anio: number;
  puedeEditar: boolean;
  onRefresh: () => void;
  onDescargarInforme?: (profesorId: string) => void;
}) {
  const [filtro, setFiltro] = useState("");

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => (
      `${f.profesor} ${f.detalle} ${f.tema} ${f.fecha} ${ETIQUETAS[f.tipo]}`
    ).toLowerCase().includes(q));
  }, [filas, filtro]);

  const grupos = useMemo(() => ORDEN
    .map((tipo) => ({ tipo, filas: visibles.filter((f) => f.tipo === tipo) }))
    .filter((g) => g.filas.length > 0), [visibles]);

  const profesoresVisibles = useMemo(() => {
    const map = new Map<string, string>();
    visibles.forEach((f) => map.set(f.profesorId, f.profesor));
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [visibles]);

  const completados = visibles.filter((f) => f.minutos > 0).length;
  const pendientes = visibles.filter((f) => f.tipo === "1a1_pendiente" || f.minutos <= 0).length;
  const profesorPDF = filtro.trim() && profesoresVisibles.length === 1 ? profesoresVisibles[0] : null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Clases y sesiones del mes</h2>
          <p className="text-xs text-muted-foreground">
            Actividad de {String(mes).padStart(2, "0")}/{anio}, separada por el tipo real de trabajo. Las sesiones 1 a 1 que cruzan el límite laboral se dividen por minutos.
          </p>
          <div className="text-[11px] text-muted-foreground mt-1">
            {completados} registro{completados === 1 ? "" : "s"} con duración · {pendientes} pendiente{pendientes === 1 ? "" : "s"}
          </div>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar profesor, estudiante o tema…"
          className="px-3 py-2 rounded-lg border bg-background text-sm w-full sm:w-80"
        />
      </div>

      {grupos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Sin clases, sesiones ni Coach que coincidan con la búsqueda.</div>
      ) : (
        <div className="space-y-5">
          {grupos.map((grupo) => {
            const minutos = grupo.filas.reduce((a, f) => a + Math.max(0, f.minutos), 0);
            const monto = grupo.filas.reduce((a, f) => a + Math.max(0, f.monto), 0);
            const color = colorTipo(grupo.tipo);
            return (
              <section key={grupo.tipo} className="rounded-xl border overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: color.fondo, color: color.texto }}>
                      {ETIQUETAS[grupo.tipo]}
                    </span>
                    <span className="text-xs text-muted-foreground">{grupo.filas.length} registro{grupo.filas.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="text-xs font-medium tabular-nums">
                    {minutos > 0 ? formatHM(minutos) : "Sin duración"} · ${monto.toFixed(2)}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[980px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                        <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                        <th className="text-left px-3 py-2 font-semibold">Horario</th>
                        <th className="text-left px-3 py-2 font-semibold">Duración</th>
                        <th className="text-left px-3 py-2 font-semibold">Profesor</th>
                        <th className="text-left px-3 py-2 font-semibold">Con quién</th>
                        <th className="text-left px-3 py-2 font-semibold">Tema tratado</th>
                        <th className="text-right px-3 py-2 font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.filas.map((f) => (
                        <tr key={f.key} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(f.fecha + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {f.horaInicio.slice(0, 5)}{f.horaFin ? ` – ${f.horaFin.slice(0, 5)}` : ""}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {f.minutos > 0 ? formatHM(f.minutos) : <span className="text-amber-600 font-semibold">Pendiente</span>}
                          </td>
                          <td className="px-3 py-2 font-medium">{f.profesor}</td>
                          <td className="px-3 py-2">{f.detalle || "—"}</td>
                          <td className="px-3 py-2">{f.tema || "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">${f.monto.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {profesorPDF && onDescargarInforme && (
        <div className="mt-5 pt-4 border-t flex justify-end">
          <button
            type="button"
            onClick={() => onDescargarInforme(profesorPDF.id)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold"
          >
            <FileText className="w-4 h-4" /> Descargar PDF · {profesorPDF.nombre}
          </button>
        </div>
      )}
    </div>
  );
}
