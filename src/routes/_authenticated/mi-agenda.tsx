import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Clock, MapPin, Link as LinkIcon, X } from "lucide-react";
import { toast } from "sonner";
import { AeHeader } from "@/components/AeHeader";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mi-agenda")({ component: Page });

interface Actividad {
  id: string; titulo: string; descripcion: string | null;
  fecha: string; hora_inicio: string; duracion_min: number;
  color: string | null; ubicacion: string | null; link: string | null;
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
  const [form, setForm] = useState({ titulo: "", hora_inicio: "09:00", duracion_min: 60, descripcion: "", ubicacion: "", link: "", color: "#7A8B6F" });

  const cargar = async () => {
    if (!uid) return;
    const { data } = await supabase.from("ae_actividades").select("*").eq("usuario_id", uid).eq("fecha", fecha).order("hora_inicio");
    setActs((data as Actividad[]) ?? []);
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

  const crear = async () => {
    if (saving) return;
    if (!uid || !form.titulo.trim()) return toast.error("Pon un título");
    setSaving(true);
    const { error } = await supabase.from("ae_actividades").insert({
      usuario_id: uid, titulo: form.titulo, descripcion: form.descripcion || null,
      fecha, hora_inicio: form.hora_inicio, duracion_min: form.duracion_min,
      color: form.color, ubicacion: form.ubicacion || null, link: form.link || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setOpen(false); setForm({ ...form, titulo: "", descripcion: "", ubicacion: "", link: "" });
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
          <button onClick={() => setOpen(true)} className="ae-btn-ink flex items-center gap-2"><Plus className="w-4 h-4"/> Actividad</button>
        </div>

        <div className="space-y-0">
          {HORAS.map((h) => {
            const hh = String(h).padStart(2, "0") + ":00";
            const enHora = acts.filter((a) => parseInt(a.hora_inicio.slice(0, 2)) === h);
            return (
              <div key={h} className="flex gap-3 py-3" style={{ borderTop: h === 5 ? "none" : "1px solid var(--ae-line)" }}>
                <div className="ae-time">{hh}</div>
                <div className="flex-1 space-y-2">
                  {enHora.length === 0 ? (
                    <div className="text-xs text-center py-2.5 rounded-xl border border-dashed" style={{ color: "var(--ae-ink-soft)", borderColor: "var(--ae-line)" }}>—</div>
                  ) : enHora.map((a) => (
                    <div key={a.id} className="ae-activity" style={{ borderLeftColor: a.color ?? "var(--ae-sage)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{a.titulo}</div>
                          <div className="text-[11px] mt-1 flex items-center gap-3 flex-wrap" style={{ color: "var(--ae-ink-soft)" }}>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{a.hora_inicio.slice(0,5)} · {a.duracion_min} min</span>
                            {a.ubicacion && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{a.ubicacion}</span>}
                            {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><LinkIcon className="w-3 h-3"/>link</a>}
                          </div>
                          {a.descripcion && <div className="text-[12px] mt-1.5 opacity-80">{a.descripcion}</div>}
                        </div>
                        <button onClick={() => borrar(a.id)} className="opacity-40 hover:opacity-90 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {open && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center z-50 p-0 sm:p-4" onClick={() => setOpen(false)}>
            <div className="ae-modal" style={{ borderRadius: "24px 24px 0 0" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>Nueva actividad</h3>
                <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="ae-label">Título</label>
                  <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="ae-input" placeholder="Ej. Reunión con cliente"/>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="ae-label">Hora</label>
                    <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="ae-input"/>
                  </div>
                  <div>
                    <label className="ae-label">Duración (min)</label>
                    <input type="number" min="15" step="15" value={form.duracion_min} onChange={(e) => setForm({ ...form, duracion_min: +e.target.value })} className="ae-input"/>
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
              </div>
              <button onClick={crear} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60">
                {saving ? "Guardando…" : "Guardar actividad"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
