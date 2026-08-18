import { useEffect, useMemo, useState } from "react";
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

type TarifaForm = { clase: string; sesion: string };
type TarifaRow = { profesor_id: string; valor_hora_clase: number; valor_hora_1a1: number };

export function PagosPrecios({ filas, mes, anio, puedeEditar, onRefresh }: {
  filas: FilaPrecio[]; mes: number; anio: number; puedeEditar: boolean; onRefresh: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(filas.map((f) => [f.key, f.monto ? String(f.monto) : ""])),
  );
  const [tarifas, setTarifas] = useState<Record<string, TarifaForm>>({});
  const [filtro, setFiltro] = useState("");
  const [guardando, setGuardando] = useState(false);

  const profesores = useMemo(() => {
    const m = new Map<string, string>();
    filas.forEach((f) => m.set(f.profesorId, f.profesor));
    return Array.from(m.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [filas]);

  useEffect(() => {
    setValores(Object.fromEntries(filas.map((f) => [f.key, f.monto ? String(f.monto) : ""])));
  }, [filas]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      // La migración de esta rama agrega la tabla; el cast mantiene compatibilidad
      // hasta que Lovable regenere automáticamente los tipos de Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("pagos_tarifas_profesor" as any)
        .select("profesor_id,valor_hora_clase,valor_hora_1a1").eq("mes", mes).eq("anio", anio);
      if (cancelado || error) return;
      const next: Record<string, TarifaForm> = {};
      ((data ?? []) as TarifaRow[]).forEach((t) => {
        next[t.profesor_id] = { clase: String(Number(t.valor_hora_clase) || ""), sesion: String(Number(t.valor_hora_1a1) || "") };
      });
      setTarifas(next);
    })();
    return () => { cancelado = true; };
  }, [mes, anio]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => (f.profesor + " " + f.detalle + " " + f.fecha).toLowerCase().includes(q));
  }, [filas, filtro]);

  const totalMostrado = visibles.reduce((a, f) => a + (Number(valores[f.key] || 0) || 0), 0);

  const guardar = async (f: FilaPrecio) => {
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

  const guardarTarifa = async (profesorId: string, tipo: "clase" | "1a1") => {
    const actual = tarifas[profesorId] ?? { clase: "", sesion: "" };
    const valor = Number(tipo === "clase" ? actual.clase : actual.sesion);
    if (!Number.isFinite(valor) || valor < 0) return toast.error("Tarifa por hora inválida");

    const valorClase = Number(actual.clase || 0);
    const valorSesion = Number(actual.sesion || 0);
    setGuardando(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: tarifaError } = await supabase.from("pagos_tarifas_profesor" as any).upsert({
      profesor_id: profesorId, mes, anio,
      valor_hora_clase: valorClase,
      valor_hora_1a1: valorSesion,
    }, { onConflict: "profesor_id,mes,anio" });
    if (tarifaError) {
      setGuardando(false);
      return toast.error(tarifaError.message);
    }

    const afectadas = filas.filter((f) => f.profesorId === profesorId && f.tipo === tipo);
    for (const f of afectadas) {
      const calculado = Math.round((valor * (f.minutos / 60)) * 100) / 100;
      const { error } = await supabase.from("pagos_items_precio").upsert({
        profesor_id: f.profesorId, tipo: f.tipo, referencia_id: f.refId, mes, anio, monto: calculado,
      }, { onConflict: "tipo,referencia_id" });
      if (error) {
        setGuardando(false);
        return toast.error(error.message);
      }
      setValores((v) => ({ ...v, [f.key]: calculado ? String(calculado) : "" }));
    }

    setGuardando(false);
    toast.success(tipo === "clase" ? "Tarifa de clases aplicada por minutos" : "Tarifa de sesiones aplicada por minutos");
    onRefresh();
  };

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Clases y sesiones del mes</h2>
          <p className="text-xs text-muted-foreground">Define el valor por hora de cada profesor. El sistema prorratea automáticamente los minutos; cada fila sigue editable como excepción.</p>
        </div>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar profesor, estudiante o tema…"
          className="px-3 py-2 rounded-lg border bg-background text-sm w-full sm:w-72" />
      </div>

      {profesores.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2 mb-5">
          {profesores.map((p) => {
            const t = tarifas[p.id] ?? { clase: "", sesion: "" };
            return (
              <div key={p.id} className="rounded-xl border bg-background/50 p-3">
                <div className="font-semibold text-sm mb-2 truncate">{p.nombre}</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Hora clase
                    <input type="number" min="0" step="0.01" disabled={!puedeEditar || guardando}
                      value={t.clase}
                      onChange={(e) => setTarifas((prev) => ({ ...prev, [p.id]: { ...t, clase: e.target.value } }))}
                      onBlur={() => guardarTarifa(p.id, "clase")}
                      placeholder="$ 0.00"
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border bg-background text-right text-sm normal-case tabular-nums" />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Hora sesión 1:1
                    <input type="number" min="0" step="0.01" disabled={!puedeEditar || guardando}
                      value={t.sesion}
                      onChange={(e) => setTarifas((prev) => ({ ...prev, [p.id]: { ...t, sesion: e.target.value } }))}
                      onBlur={() => guardarTarifa(p.id, "1a1")}
                      placeholder="$ 0.00"
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border bg-background text-right text-sm normal-case tabular-nums" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            {visibles.map((f) => (
              <tr key={f.key} className="border-t">
                <td className="px-2 py-2 whitespace-nowrap">{new Date(f.fecha + "T00:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</td>
                <td className="px-2 py-2 whitespace-nowrap">{f.horaInicio.slice(0, 5)}{f.horaFin ? ` – ${f.horaFin.slice(0, 5)}` : ""}</td>
                <td className="px-2 py-2 whitespace-nowrap">{formatHM(f.minutos)}</td>
                <td className="px-2 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: f.tipo === "clase" ? "rgba(124,107,255,.12)" : "rgba(34,197,94,.12)", color: f.tipo === "clase" ? "var(--violet)" : "#16a34a" }}>
                    {f.tipo === "clase" ? "Clase en vivo" : "1 a 1"}
                  </span>
                </td>
                <td className="px-2 py-2">{f.profesor}</td>
                <td className="px-2 py-2">{f.detalle}</td>
                <td className="px-2 py-2 text-right">
                  <input type="number" step="0.01" min="0" disabled={!puedeEditar || guardando}
                    value={valores[f.key] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [f.key]: e.target.value }))}
                    onBlur={() => guardar(f)} placeholder="0.00"
                    className="w-24 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" />
                </td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin clases ni sesiones este mes.</td></tr>}
            {visibles.length > 0 && (
              <tr className="bg-muted/40 border-t">
                <td colSpan={6} className="px-2 py-2 text-right text-xs uppercase tracking-wider font-semibold">Total</td>
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
