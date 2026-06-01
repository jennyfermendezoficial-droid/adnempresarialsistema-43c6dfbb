import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Clock, MapPin, Link as LinkIcon, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AeHeader } from "@/components/AeHeader";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mi-agenda")({ component: Page });

interface Actividad {
  id: string; titulo: string; descripcion: string | null;
  fecha: string; hora_inicio: string; duracion_min: number;
  color: string | null; ubicacion: string | null; link: string | null;
  recurrencia?: string | null;
}

const HORAS = Array.from({ length: 19 }, (_, i) => 5 + i); // 5–23
const COLORES = [
  { name: "Trabajo", v: "#7A8B6F" },
  { name: "Personal", v: "#C2756B" },
  { name: "Reunión", v: "#6B8AA8" },
  { name: "Clase", v: "#B8894A" },
  { name: "Lectura", v: "#8B6B8B" },
];

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [acts, setActs] = useState<Actividad[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Actividad | null>(null);
  const emptyForm = { titulo: "", fecha, hora_inicio: "09:00", duracion_min: 60, descripcion: "", ubicacion: "", link: "", color: "#7A8B6F", recurrencia: "ninguna" };
  const [form, setForm] = useState(emptyForm);

  const cargar = async () => {
    if (!uid) return;
    // Trae actividades del día Y recurrentes diarias creadas en/antes de la fecha
    const { data } = await supabase
      .from("ae_actividades")
      .select("*")
      .eq("usuario_id", uid)
      .or(`fecha.eq.${fecha},recurrencia.eq.diaria`)
      .order("hora_inicio");
    const filtradas = ((data as Actividad[]) ?? []).filter(
      (a) => a.fecha === fecha || (a.recurrencia === "diaria" && a.fecha <= fecha)
    );
    setActs(filtradas);
  };
  useEffect(() => { cargar(); }, [uid, fecha]); // eslint-disable-line

  // Semana actual: LUN..DOM que contiene "hoy"
  const dias = useMemo(() => {
    const out: { d: Date; dow: string; num: number }[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const dow = (base.getDay() + 6) % 7; // 0 = Lun
    const lunes = new Date(base); lunes.setDate(base.getDate() - dow);
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes); d.setDate(lunes.getDate() + i);
      out.push({ d, dow: d.toLocaleDateString("es-EC", { weekday: "short" }).replace(".", "").slice(0, 3), num: d.getDate() });
    }
    return out;
  }, []);

  // Próxima notificación = primera actividad futura del día
  const proxima = useMemo(() => {
    const ahora = new Date();
    const hoy = ahora.toISOString().slice(0, 10);
    if (fecha !== hoy) return acts[0] ?? null;
    const nowMin = ahora.getHours() * 60 + ahora.getMinutes();
    return acts.find(a => {
      const [h, m] = a.hora_inicio.split(":").map(Number);
      return h * 60 + m >= nowMin;
    }) ?? null;
  }, [acts, fecha]);

  const abrirNueva = () => {
    setEditing(null);
    setForm({ ...emptyForm, fecha });
    setOpen(true);
  };

  const abrirEditar = (actividad: Actividad) => {
    setEditing(actividad);
    setForm({
      titulo: actividad.titulo,
      fecha: actividad.fecha,
      hora_inicio: actividad.hora_inicio.slice(0, 5),
      duracion_min: actividad.duracion_min,
      descripcion: actividad.descripcion || "",
      ubicacion: actividad.ubicacion || "",
      link: actividad.link || "",
      color: actividad.color || "#7A8B6F",
      recurrencia: actividad.recurrencia || "ninguna",
    });
    setOpen(true);
  };

  const guardar = async () => {
    if (saving) return;
    if (!uid || !form.titulo.trim()) return toast.error("Pon un título");
    setSaving(true);
    const payload = {
      usuario_id: uid, titulo: form.titulo, descripcion: form.descripcion || null,
      fecha: form.fecha, hora_inicio: form.hora_inicio, duracion_min: form.duracion_min,
      color: form.color, ubicacion: form.ubicacion || null, link: form.link || null,
      recurrencia: form.recurrencia || "ninguna",
    };
    const { error } = editing
      ? await supabase.from("ae_actividades").update(payload).eq("id", editing.id)
      : await supabase.from("ae_actividades").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Actividad actualizada" : "Actividad guardada");
    setOpen(false); setEditing(null); setFecha(form.fecha); setForm({ ...emptyForm, fecha: form.fecha });
    cargar();
  };

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar actividad?")) return;
    await supabase.from("ae_actividades").delete().eq("id", id);
    cargar();
  };

  return (
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
        <AeHeader />

        {proxima && (
          <div className="mb-5">
            <div className="ae-eyebrow mb-2">Próximas notificaciones</div>
            <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "var(--ae-ink)", color: "var(--ae-cream)" }}>
              <div className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0" style={{ background: "rgba(184,137,74,0.25)" }}>
                <Bell className="w-4 h-4" style={{ color: "var(--ae-gold)" }} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm">{proxima.titulo} a las {proxima.hora_inicio.slice(0,5)}</div>
                <div className="text-[11px] opacity-70 mt-0.5">Te avisaré 10 min antes · {proxima.duracion_min} min</div>
              </div>
            </div>
          </div>
        )}

        <div className="ae-eyebrow mb-2">Mi día</div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {dias.map(({ d, dow, num }) => {
            const v = d.toISOString().slice(0, 10);
            const sel = v === fecha;
            return (
              <button key={v} onClick={() => setFecha(v)} className={`ae-day ${sel ? "ae-day-active" : ""}`}>
                <span className="dow">{dow}</span>
                <span className="num">{num}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="ae-eyebrow" style={{ color: "var(--ae-gold-deep)" }}>Hoy</div>
            <div className="text-base font-semibold capitalize" style={{ fontFamily: "Fraunces, serif" }}>
              {new Date(fecha + "T00:00").toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          <button onClick={abrirNueva} className="ae-btn-ink flex items-center gap-2"><Plus className="w-4 h-4"/> Actividad</button>
        </div>

        <div className="space-y-0">
          {HORAS.map((h) => {
            const hh = String(h).padStart(2, "0") + ":00";
            const hStart = h * 60;
            const hEnd = (h + 1) * 60;
            const enHora = acts
              .map((a) => {
                const [ah, am] = a.hora_inicio.split(":").map(Number);
                const start = ah * 60 + am;
                const end = start + a.duracion_min;
                if (end <= hStart || start >= hEnd) return null;
                const minsEnHora = Math.min(end, hEnd) - Math.max(start, hStart);
                return { a, start, end, minsEnHora, esInicio: start >= hStart && start < hEnd };
              })
              .filter((x): x is { a: Actividad; start: number; end: number; minsEnHora: number; esInicio: boolean } => x !== null);
            return (
              <div key={h} className="flex gap-3 py-3" style={{ borderTop: h === 5 ? "none" : "1px solid var(--ae-line)" }}>
                <div className="ae-time">{hh}</div>
                <div className="flex-1 space-y-2">
                  {enHora.length === 0 ? (
                    <div className="text-xs text-center py-2.5 rounded-xl border border-dashed" style={{ color: "var(--ae-ink-soft)", borderColor: "var(--ae-line)" }}>—</div>
                  ) : enHora.map(({ a, esInicio, end }) => {
                    const totH = Math.floor(a.duracion_min / 60);
                    const totM = a.duracion_min % 60;
                    const durTxt = totH ? `${totH}h${totM ? ` ${totM}m` : ""}` : `${totM} min`;
                    if (!esInicio) {
                      // Indicador delgado de continuación, sin texto confuso
                      return (
                        <div
                          key={a.id + "-" + h}
                          className="rounded-full h-1.5"
                          style={{ background: a.color ?? "var(--ae-sage)", opacity: 0.35 }}
                          aria-hidden
                        />
                      );
                    }
                    const endH = Math.floor(end / 60);
                    const endM = end % 60;
                    const horaFin = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
                    return (
                    <div key={a.id + "-" + h} className="ae-activity" style={{ borderLeftColor: a.color ?? "var(--ae-sage)" }}>
                      <div className="flex items-stretch justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{a.titulo}</div>
                          <div className="text-[11px] mt-1 flex items-center gap-3 flex-wrap" style={{ color: "var(--ae-ink-soft)" }}>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3"/>
                              {a.hora_inicio.slice(0,5)} – {horaFin} · {durTxt}
                            </span>
                            {a.ubicacion && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{a.ubicacion}</span>}
                            {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><LinkIcon className="w-3 h-3"/>link</a>}
                          </div>
                          {a.descripcion && <div className="text-[12px] mt-1.5 opacity-80">{a.descripcion}</div>}
                          <div className="flex items-center gap-1 mt-2">
                            <button onClick={() => abrirEditar(a)} className="opacity-50 hover:opacity-100 p-1" aria-label="Editar actividad"><Pencil className="w-3.5 h-3.5"/></button>
                            <button onClick={() => borrar(a.id)} className="opacity-40 hover:opacity-90 p-1" aria-label="Borrar actividad"><Trash2 className="w-3.5 h-3.5"/></button>
                          </div>
                        </div>
                        <div
                          className="flex flex-col items-center justify-center px-3 rounded-xl min-w-[78px]"
                          style={{ background: (a.color ?? "var(--ae-sage)") + "22", color: a.color ?? "var(--ae-sage)" }}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Hora</div>
                          <div className="text-2xl font-bold leading-none" style={{ fontFamily: "Fraunces, serif" }}>{a.hora_inicio.slice(0,5)}</div>
                          <div className="text-[10px] mt-1 opacity-80">{durTxt}</div>
                        </div>
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            );
          })}
        </div>

        {open && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center z-50 p-0 sm:p-4" onClick={() => setOpen(false)}>
            <div
              className="ae-modal overflow-y-auto"
              style={{ borderRadius: "24px 24px 0 0", maxHeight: "90vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                 <h3 className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{editing ? "Editar actividad" : "Nueva actividad"}</h3>
                <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="ae-label">Título</label>
                  <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="ae-input" placeholder="Ej. Reunión con cliente"/>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="ae-label">Fecha</label>
                    <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="ae-input"/>
                  </div>
                  <div>
                    <label className="ae-label">Hora</label>
                    <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="ae-input"/>
                  </div>
                </div>
                <div>
                  <label className="ae-label">Duración</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <select
                      value={Math.floor(form.duracion_min / 60)}
                      onChange={(e) => setForm({ ...form, duracion_min: +e.target.value * 60 + (form.duracion_min % 60) })}
                      className="ae-input"
                    >
                      {Array.from({ length: 13 }, (_, i) => i).map((h) => (
                        <option key={h} value={h}>{h} {h === 1 ? "hora" : "horas"}</option>
                      ))}
                    </select>
                    <select
                      value={form.duracion_min % 60}
                      onChange={(e) => setForm({ ...form, duracion_min: Math.floor(form.duracion_min / 60) * 60 + +e.target.value })}
                      className="ae-input"
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                        <option key={m} value={m}>{m} min</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: "var(--ae-ink-soft)" }}>
                    Total: {form.duracion_min} min — la actividad se mostrará en cada hora que ocupe.
                  </div>
                </div>
                <div>
                  <label className="ae-label">Categoría / color</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORES.map((c) => (
                      <button key={c.v} type="button" onClick={() => setForm({ ...form, color: c.v })}
                        className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition"
                        style={{ background: form.color === c.v ? c.v : "#fff", color: form.color === c.v ? "#fff" : "var(--ae-ink)", borderColor: c.v }}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: form.color === c.v ? "#fff" : c.v }}/> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="ae-label">Ubicación (opcional)</label>
                  <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} className="ae-input" placeholder="Casa, oficina…"/>
                </div>
                <div>
                  <label className="ae-label">Link Zoom / Meet (opcional)</label>
                  <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="ae-input" placeholder="https://…"/>
                </div>
                <div>
                  <label className="ae-label">Notas</label>
                  <textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="ae-input"/>
                </div>
                <label className="flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer" style={{ borderColor: "var(--ae-line)", background: "var(--ae-paper)" }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Repetir todos los días</div>
                    <div className="text-[11px]" style={{ color: "var(--ae-ink-soft)" }}>
                      La actividad aparecerá cada día a la misma hora.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.recurrencia === "diaria"}
                    onChange={(e) => setForm({ ...form, recurrencia: e.target.checked ? "diaria" : "ninguna" })}
                    className="w-5 h-5 accent-current flex-shrink-0"
                    style={{ accentColor: form.color }}
                  />
                </label>
              </div>
              <button onClick={guardar} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60">
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar actividad"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
