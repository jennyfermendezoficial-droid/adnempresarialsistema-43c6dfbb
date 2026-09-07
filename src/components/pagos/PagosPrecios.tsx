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

function minutosProgramados(inicio: string, fin: string) {
  if (!inicio || !fin) return 0;
  const [hi, mi] = inicio.slice(0, 5).split(":").map(Number);
  const [hf, mf] = fin.slice(0, 5).split(":").map(Number);
  if (![hi, mi, hf, mf].every(Number.isFinite)) return 0;
  const total = (hf * 60 + mf) - (hi * 60 + mi);
  return total > 0 ? total : 0;
}

const TEMAS: { match: string; tema: string }[] = [
  { match: "jennyfer", tema: "Marketing · WhatsApp" },
  { match: "jaime", tema: "Landing & sistemas" },
  { match: "karen", tema: "WhatsApp · Seguimiento" },
  { match: "henry", tema: "Meta Ads" },
  { match: "erick", tema: "IA · imágenes" },
];

function temaProfesor(nombre: string) {
  const n = nombre.toLowerCase();
  return TEMAS.find((t) => n.includes(t.match))?.tema ?? "Mentoría / seguimiento";
}

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
    return filas.filter((f) => (
      f.profesor + " " + f.detalle + " " + f.fecha + " " + temaProfesor(f.profesor)
    ).toLowerCase().includes(q));
  }, [filas, filtro]);

  const completados = visibles.filter((f) => f.minutos > 0).length;
  const pendientes = visibles.length - completados;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Clases y sesiones del mes</h2>
          <p className="text-xs text-muted-foreground">
            Aquí se muestran todas las clases en vivo y sesiones 1 a 1 del período. El valor se calcula arriba con la tarifa por hora de cada profesor; no se edita por registro.
          </p>
          <div className="text-[11px] text-muted-foreground mt-1">
            {completados} completado{completados === 1 ? "" : "s"} · {pendientes} pendiente{pendientes === 1 ? "" : "s"} de duración
          </div>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar profesor, estudiante o tema…"
          className="px-3 py-2 rounded-lg border bg-background text-sm w-full sm:w-72"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-2 py-2 font-semibold">Fecha</th>
              <th className="text-left px-2 py-2 font-semibold">Horario</th>
              <th className="text-left px-2 py-2 font-semibold">Duración</th>
              <th className="text-left px-2 py-2 font-semibold">Tipo</th>
              <th className="text-left px-2 py-2 font-semibold">Profesor</th>
              <th className="text-left px-2 py-2 font-semibold">Con quién</th>
              <th className="text-left px-2 py-2 font-semibold">Tema</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const pendiente = f.minutos <= 0;
              const programados = pendiente ? minutosProgramados(f.horaInicio, f.horaFin) : 0;
              const esClase = f.tipo === "clase";
              const conQuien = esClase ? "Clase grupal" : f.detalle;
              const tema = esClase ? f.detalle : temaProfesor(f.profesor);
              return (
                <tr key={f.key} className="border-t">
                  <td className="px-2 py-2 whitespace-nowrap">
                    {new Date(f.fecha + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {f.horaInicio.slice(0, 5)}{f.horaFin ? ` – ${f.horaFin.slice(0, 5)}` : ""}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {pendiente ? (
                      <div>
                        <span className="text-amber-600 dark:text-amber-300 font-semibold">Pendiente de registro</span>
                        {programados > 0 && <div className="text-[11px] text-muted-foreground">Programado: {formatHM(programados)}</div>}
                      </div>
                    ) : formatHM(f.minutos)}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: esClase ? "rgba(124,107,255,.12)" : "rgba(34,197,94,.12)",
                        color: esClase ? "var(--violet)" : "#16a34a",
                      }}
                    >
                      {esClase ? "Clase en vivo" : "Sesión 1 a 1"}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-medium">{f.profesor}</td>
                  <td className="px-2 py-2">{conQuien}</td>
                  <td className="px-2 py-2">{tema}</td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">Sin clases ni sesiones este mes.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
