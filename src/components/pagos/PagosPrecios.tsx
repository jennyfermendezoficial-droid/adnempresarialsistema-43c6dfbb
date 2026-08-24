import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatHM } from "@/lib/tiempo";

export interface FilaPrecio {
  key: string;            // tipo:refId
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

export function PagosPrecios({ filas, mes, anio, puedeEditar, onRefresh }: {
  filas: FilaPrecio[]; mes: number; anio: number; puedeEditar: boolean; onRefresh: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(filas.map((f) => [f.key, f.monto ? String(f.monto) : ""])),
  );
  const [filtro, setFiltro] = useState("");
  const [guardando, setGuardando] = useState(false);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => (f.profesor + " " + f.detalle + " " + f.fecha).toLowerCase().includes(q));
  }, [filas, filtro]);

  // Solo los registros con duración real cuentan para el total; los pendientes siguen visibles.
  const totalMostrado = visibles
    .filter((f) => f.minutos > 0)
    .reduce((a, f) => a + (Number(valores[f.key] || 0) || 0), 0);

  const guardar = async (f: FilaPrecio) => {
    if (f.minutos <= 0) return;
    const monto = Number(valores[f.key] || 0);
    if (!Number.isFinite(monto) || monto < 0) return toast.error("Valor inválido");
    if (monto === f.monto) return;
    setGuardando(true);
    const { error } = await supabase.from("pagos_items_precio").upsert({
      profesor_id: f.profesorId, tipo: f.tipo, referencia_id: f.refId, mes, anio, monto,
    }, { onConflict: "tipo,referencia_id" });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Valor guardado");
    onRefresh();
  };

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Clases y sesiones del mes</h2>
          <p className="text-xs text-muted-foreground">
            Se muestran todos los registros. Los que aún no tienen duración real permanecen visibles como pendientes y no generan pago hasta completarse.
          </p>
        </div>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar profesor, estudiante o tema…"
          className="px-3 py-2 rounded-lg border bg-background text-sm w-full sm:w-72" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-2 py-2 font-semibold">Fecha</th>
              <th className="text-left px-2 py-2 font-semibold">Horario</th>
              <th className="text-left px-2 py-2 font-semibold">Duración</th>
              <th className="text-left px-2 py-2 font-semibold">Tipo</th>
              <th className="text-left px-2 py-2 font-semibold">Profesor</th>
              <th className="text-left px-2 py-2 font-semibold">Con / Tema</th>
              <th className="text-right px-2 py-2 font-semibold">Valor $</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const pendiente = f.minutos <= 0;
              const programados = pendiente ? minutosProgramados(f.horaInicio, f.horaFin) : 0;
              return (
                <tr key={f.key} className="border-t">
                  <td className="px-2 py-2 whitespace-nowrap">{new Date(f.fecha + "T00:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{f.horaInicio.slice(0, 5)}{f.horaFin ? ` – ${f.horaFin.slice(0, 5)}` : ""}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {pendiente ? (
                      <div>
                        <span className="text-amber-600 dark:text-amber-300 font-semibold">Pendiente de registro</span>
                        {programados > 0 && <div className="text-[11px] text-muted-foreground">Horario programado: {formatHM(programados)}</div>}
                      </div>
                    ) : formatHM(f.minutos)}
                  </td>
                  <td className="px-2 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: f.tipo === "clase" ? "rgba(124,107,255,.12)" : "rgba(34,197,94,.12)", color: f.tipo === "clase" ? "var(--violet)" : "#16a34a" }}>
                      {f.tipo === "clase" ? "Clase en vivo" : "1 a 1"}
                    </span>
                  </td>
                  <td className="px-2 py-2">{f.profesor}</td>
                  <td className="px-2 py-2">{f.detalle}</td>
                  <td className="px-2 py-2 text-right">
                    {pendiente ? (
                      <div className="text-xs text-muted-foreground">
                        <div className="font-semibold text-amber-600 dark:text-amber-300">No computa</div>
                        <div>Registra duración primero</div>
                      </div>
                    ) : (
                      <input type="number" step="0.01" min="0" disabled={!puedeEditar || guardando}
                        value={valores[f.key] ?? ""}
                        onChange={(e) => setValores((v) => ({ ...v, [f.key]: e.target.value }))}
                        onBlur={() => guardar(f)} placeholder="0.00"
                        className="w-24 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" />
                    )}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin clases ni sesiones este mes.</td></tr>}
            {visibles.length > 0 && (
              <tr className="bg-muted/40 border-t">
                <td colSpan={6} className="px-2 py-2 text-right text-xs uppercase tracking-wider font-semibold">Total de registros completados</td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">${totalMostrado.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!puedeEditar && <div className="text-xs text-muted-foreground mt-2">Solo un administrador puede cambiar los valores.</div>}
    </div>
  );
}
