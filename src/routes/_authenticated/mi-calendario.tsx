import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, ChevronRight, X, Clock, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mi-calendario")({ component: Page });

interface ActMini { id: string; titulo: string; descripcion: string | null; fecha: string; hora_inicio: string; duracion_min: number; color: string | null; ubicacion: string | null }

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [mapActs, setMapActs] = useState<Record<string, ActMini[]>>({});
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Lun=0

  useEffect(() => {
    if (!uid) return;
    const ini = firstDay.toISOString().slice(0, 10);
    const fin = lastDay.toISOString().slice(0, 10);
    supabase.from("ae_actividades")
      .select("id,titulo,descripcion,fecha,hora_inicio,duracion_min,color,ubicacion")
      .eq("usuario_id", uid).gte("fecha", ini).lte("fecha", fin)
      .order("hora_inicio")
      .then(({ data }) => {
        const m: Record<string, ActMini[]> = {};
        ((data ?? []) as ActMini[]).forEach((a) => { (m[a.fecha] ??= []).push(a); });
        setMapActs(m);
      });
  }, [uid, year, month]); // eslint-disable-line

  const dias = useMemo(() => {
    const cells: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, key: "e" + i });
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month, d);
      cells.push({ date: dt, key: dt.toISOString() });
    }
    return cells;
  }, [year, month, startOffset, lastDay]);

  const cambiar = (n: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); setCursor(d); };
  const actsDia = diaSel ? (mapActs[diaSel] ?? []) : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mi Agenda Emprendedora</div>
      <h1 className="text-3xl font-semibold mb-1">Calendario mensual</h1>
      <p className="text-sm text-muted-foreground mb-5">Toca cualquier día para ver tus pendientes con detalle.</p>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => cambiar(-1)} className="p-2 rounded-lg border"><ChevronLeft className="w-4 h-4"/></button>
        <div className="text-lg font-semibold capitalize">{cursor.toLocaleDateString("es-EC", { month: "long", year: "numeric" })}</div>
        <button onClick={() => cambiar(1)} className="p-2 rounded-lg border"><ChevronRight className="w-4 h-4"/></button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["L","M","M","J","V","S","D"].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map(({ date, key }) => {
          if (!date) return <div key={key} className="aspect-square" />;
          const iso = date.toISOString().slice(0, 10);
          const lista = mapActs[iso] || [];
          const hoy = iso === new Date().toISOString().slice(0, 10);
          const visible = lista.slice(0, 2);
          const restantes = lista.length - visible.length;
          return (
            <button key={key} onClick={() => setDiaSel(iso)}
              className="min-h-[92px] sm:aspect-square rounded-lg border bg-card p-1.5 flex flex-col text-left hover:border-violet transition overflow-hidden"
              style={hoy ? { borderColor: "var(--violet)", background: "rgba(124,107,255,.08)" } : {}}
            >
              <div className="text-[12px] font-semibold mb-0.5">{date.getDate()}</div>
              <div className="flex flex-col gap-0.5 flex-1 min-h-0">
                {visible.map((a) => (
                  <div key={a.id} className="text-[9.5px] sm:text-[10px] leading-tight px-1 py-0.5 rounded truncate"
                    style={{ background: (a.color || "#7C6BFF") + "33", color: "var(--ink)", borderLeft: `2px solid ${a.color || "#7C6BFF"}` }}
                    title={`${a.hora_inicio.slice(0,5)} ${a.titulo}`}>
                    <span className="font-semibold">{a.hora_inicio.slice(0,5)}</span> {a.titulo}
                  </div>
                ))}
                {restantes > 0 && (
                  <div className="text-[9.5px] text-muted-foreground pl-1">+{restantes} más</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {diaSel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setDiaSel(null)}>
          <div className="bg-card rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDiaSel(null)} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pendientes</div>
            <div className="text-xl font-semibold capitalize mb-1">{new Date(diaSel + "T00:00").toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div className="text-xs text-muted-foreground mb-4">{actsDia.length} actividad{actsDia.length === 1 ? "" : "es"}</div>

            {actsDia.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border-2 border-dashed rounded-xl">Sin actividades este día.</div>
            ) : (
              <div className="space-y-2">
                {actsDia.map((a) => (
                  <div key={a.id} className="rounded-xl p-3 border-l-4" style={{ background: (a.color || "#7C6BFF") + "1a", borderLeftColor: a.color || "#7C6BFF" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm">{a.titulo}</div>
                      <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/>{a.hora_inicio.slice(0,5)}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{a.duracion_min} min{a.ubicacion ? <> · <MapPin className="w-3 h-3 inline"/> {a.ubicacion}</> : null}</div>
                    {a.descripcion && <div className="text-[12px] mt-1.5 opacity-80">{a.descripcion}</div>}
                  </div>
                ))}
              </div>
            )}

            <Link to="/mi-agenda" onClick={() => setDiaSel(null)} className="mt-4 block text-center px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
              Ir a Agenda diaria
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
