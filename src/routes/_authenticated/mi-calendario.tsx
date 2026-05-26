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
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
        <div className="ae-eyebrow mb-1">Mi Agenda Emprendedora</div>
        <h1 className="ae-h1 mb-1">Calendario <em>mensual</em></h1>
        <p className="ae-sub mb-5">Toca un día para ver tus pendientes.</p>

        <div className="flex items-center justify-between mb-4">
          <button onClick={() => cambiar(-1)} className="ae-btn-ghost !p-2 !px-3"><ChevronLeft className="w-4 h-4"/></button>
          <div className="text-lg font-semibold capitalize" style={{ fontFamily: "Fraunces, serif" }}>{cursor.toLocaleDateString("es-EC", { month: "long", year: "numeric" })}</div>
          <button onClick={() => cambiar(1)} className="ae-btn-ghost !p-2 !px-3"><ChevronRight className="w-4 h-4"/></button>
        </div>

        <div className="ae-cal">
          {["L","M","X","J","V","S","D"].map((d, i) => (
            <div key={i} className="ae-cal-head">{d}</div>
          ))}
          {dias.map(({ date, key }) => {
            if (!date) return <div key={key} />;
            const iso = date.toISOString().slice(0, 10);
            const lista = mapActs[iso] || [];
            const hoy = iso === new Date().toISOString().slice(0, 10);
            const colores = Array.from(new Set(lista.map((a) => a.color || "#7A8B6F"))).slice(0, 4);
            return (
              <button key={key} onClick={() => setDiaSel(iso)} className={`ae-cal-day ${hoy ? "today" : ""}`}>
                <span>{date.getDate()}</span>
                <div className="ae-cal-dots">
                  {colores.map((c, i) => <span key={i} className="ae-cal-dot" style={{ background: c }}/>)}
                </div>
              </button>
            );
          })}
        </div>

        {diaSel && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => setDiaSel(null)}>
            <div className="ae-modal max-h-[80vh] overflow-y-auto" style={{ borderRadius: "24px 24px 0 0" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="ae-eyebrow">Pendientes</div>
                  <div className="text-xl font-semibold capitalize" style={{ fontFamily: "Fraunces, serif" }}>{new Date(diaSel + "T00:00").toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}</div>
                </div>
                <button onClick={() => setDiaSel(null)} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
              </div>
              <div className="text-xs mb-4" style={{ color: "var(--ae-ink-soft)" }}>{actsDia.length} actividad{actsDia.length === 1 ? "" : "es"}</div>

              {actsDia.length === 0 ? (
                <div className="text-sm py-6 text-center border border-dashed rounded-xl" style={{ color: "var(--ae-ink-soft)", borderColor: "var(--ae-line)" }}>Sin actividades este día.</div>
              ) : (
                <div className="space-y-2.5">
                  {actsDia.map((a) => (
                    <div key={a.id} className="ae-activity" style={{ borderLeftColor: a.color || "var(--ae-sage)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm">{a.titulo}</div>
                        <div className="text-[11px] flex items-center gap-1" style={{ color: "var(--ae-ink-soft)", fontFamily: "Fraunces, serif" }}><Clock className="w-3 h-3"/>{a.hora_inicio.slice(0,5)}</div>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--ae-ink-soft)" }}>{a.duracion_min} min{a.ubicacion ? <> · <MapPin className="w-3 h-3 inline"/> {a.ubicacion}</> : null}</div>
                      {a.descripcion && <div className="text-[12px] mt-1.5 opacity-80">{a.descripcion}</div>}
                    </div>
                  ))}
                </div>
              )}

              <Link to="/mi-agenda" onClick={() => setDiaSel(null)} className="ae-btn-ink w-full mt-5 text-center block">
                Ir a la agenda del día
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
