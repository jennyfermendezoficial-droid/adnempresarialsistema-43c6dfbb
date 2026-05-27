import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, ChevronRight, X, Clock, MapPin, Pencil, Trash2, Check } from "lucide-react";
import { AeHeader } from "@/components/AeHeader";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mi-calendario")({ component: Page });

interface ActMini { id: string; titulo: string; descripcion: string | null; fecha: string; hora_inicio: string; duracion_min: number; color: string | null; ubicacion: string | null; link?: string | null }

const COLORES = ["#7A8B6F", "#C2756B", "#6B8AA8", "#B8894A", "#8B6B8B"];

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [mapActs, setMapActs] = useState<Record<string, ActMini[]>>({});
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<ActMini | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ titulo: "", fecha: "", hora_inicio: "09:00", duracion_min: 60, descripcion: "", ubicacion: "", color: "#7A8B6F" });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Lun=0

  const cargarMes = () => {
    if (!uid) return;
    const ini = firstDay.toISOString().slice(0, 10);
    const fin = lastDay.toISOString().slice(0, 10);
    supabase.from("ae_actividades")
      .select("id,titulo,descripcion,fecha,hora_inicio,duracion_min,color,ubicacion,link")
      .eq("usuario_id", uid).gte("fecha", ini).lte("fecha", fin)
      .order("hora_inicio")
      .then(({ data }) => {
        const m: Record<string, ActMini[]> = {};
        ((data ?? []) as ActMini[]).forEach((a) => { (m[a.fecha] ??= []).push(a); });
        setMapActs(m);
      });
  };
  useEffect(() => { cargarMes(); }, [uid, year, month]); // eslint-disable-line

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

  const abrirEditar = (a: ActMini) => {
    setEditing(a);
    setForm({ titulo: a.titulo, fecha: a.fecha, hora_inicio: a.hora_inicio.slice(0, 5), duracion_min: a.duracion_min, descripcion: a.descripcion || "", ubicacion: a.ubicacion || "", color: a.color || "#7A8B6F" });
  };

  const guardarEdicion = async () => {
    if (!editing || !form.titulo.trim()) return toast.error("Pon un título");
    setSaving(true);
    const { error } = await supabase.from("ae_actividades").update({ titulo: form.titulo, fecha: form.fecha, hora_inicio: form.hora_inicio, duracion_min: form.duracion_min, descripcion: form.descripcion || null, ubicacion: form.ubicacion || null, color: form.color }).eq("id", editing.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Actividad actualizada");
    setEditing(null); setDiaSel(form.fecha); cargarMes();
  };

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar actividad?")) return;
    await supabase.from("ae_actividades").delete().eq("id", id);
    cargarMes();
  };

  // Esta semana en números
  const stats = useMemo(() => {
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const dow = (base.getDay() + 6) % 7;
    const lunes = new Date(base); lunes.setDate(base.getDate() - dow);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    const ini = lunes.toISOString().slice(0, 10);
    const fin = domingo.toISOString().slice(0, 10);
    const arr: ActMini[] = [];
    Object.entries(mapActs).forEach(([f, list]) => { if (f >= ini && f <= fin) arr.push(...list); });
    const horas = arr.reduce((s, a) => s + a.duracion_min, 0) / 60;
    const reuniones = arr.filter(a => /reuni|meet|zoom/i.test(a.titulo)).length;
    const descanso = Math.max(0, (7 * 8) - horas); // 8 h diarias de referencia
    return { horas, reuniones, total: arr.length, descanso };
  }, [mapActs]);

  return (
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
        <AeHeader />

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

        <div className="ae-eyebrow mt-6 mb-3">Esta semana en números</div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Horas productivas" value={`${stats.horas.toFixed(0)} h`} />
          <StatCard label="Actividades" value={String(stats.total)} hint={`${stats.reuniones} reuniones`} />
          <StatCard label="Tiempo libre" value={`${stats.descanso.toFixed(0)} h`} />
          <StatCard label="Días con plan" value={String(Object.keys(mapActs).length)} />
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
                        <div className="font-semibold text-sm min-w-0 flex-1">{a.titulo}</div>
                        <div className="flex items-center gap-1">
                          <div className="text-[11px] flex items-center gap-1" style={{ color: "var(--ae-ink-soft)", fontFamily: "Fraunces, serif" }}><Clock className="w-3 h-3"/>{a.hora_inicio.slice(0,5)}</div>
                          <button onClick={() => abrirEditar(a)} className="opacity-50 hover:opacity-100 p-1" aria-label="Editar actividad"><Pencil className="w-3.5 h-3.5"/></button>
                          <button onClick={() => borrar(a.id)} className="opacity-40 hover:opacity-90 p-1" aria-label="Borrar actividad"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
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

        {editing && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => setEditing(null)}>
            <div className="ae-modal max-h-[88vh] overflow-y-auto" style={{ borderRadius: "24px 24px 0 0" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>Editar actividad</h3>
                <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
              </div>
              <div className="space-y-3">
                <div><label className="ae-label">Título</label><input className="ae-input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} autoFocus/></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="ae-label">Fecha</label><input type="date" className="ae-input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}/></div>
                  <div><label className="ae-label">Hora</label><input type="time" className="ae-input" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}/></div>
                </div>
                <div><label className="ae-label">Duración (min)</label><input type="number" min="15" step="15" className="ae-input" value={form.duracion_min} onChange={(e) => setForm({ ...form, duracion_min: +e.target.value })}/></div>
                <div><label className="ae-label">Ubicación</label><input className="ae-input" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}/></div>
                <div><label className="ae-label">Color</label><div className="flex gap-2">{COLORES.map(c => <button key={c} onClick={() => setForm({ ...form, color: c })} className="w-8 h-8 rounded-full border-2" style={{ background: c, borderColor: form.color === c ? "var(--ae-ink)" : "transparent" }}/>)}</div></div>
                <div><label className="ae-label">Notas</label><textarea rows={2} className="ae-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}/></div>
              </div>
              <button onClick={guardarEdicion} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60 flex items-center justify-center gap-2"><Check className="w-4 h-4"/> {saving ? "Guardando…" : "Guardar cambios"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ae-card p-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--ae-ink-soft)" }}>{label}</div>
      <div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>{value}</div>
      {hint && <div className="text-[11px] mt-0.5" style={{ color: "var(--ae-ink-soft)" }}>{hint}</div>}
    </div>
  );
}
