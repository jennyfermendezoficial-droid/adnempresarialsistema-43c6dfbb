import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Clock, MapPin, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mi-agenda")({ component: Page });

interface Actividad {
  id: string; titulo: string; descripcion: string | null;
  fecha: string; hora_inicio: string; duracion_min: number;
  color: string | null; ubicacion: string | null; link: string | null;
}

const HORAS = Array.from({ length: 19 }, (_, i) => 5 + i); // 5–23

function Page() {
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [acts, setActs] = useState<Actividad[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ titulo: "", hora_inicio: "09:00", duracion_min: 60, descripcion: "", ubicacion: "", link: "", color: "#7C6BFF" });

  const cargar = async () => {
    if (!uid) return;
    const { data } = await supabase.from("ae_actividades").select("*").eq("usuario_id", uid).eq("fecha", fecha).order("hora_inicio");
    setActs((data as Actividad[]) ?? []);
  };
  useEffect(() => { cargar(); }, [uid, fecha]); // eslint-disable-line

  const dias = useMemo(() => {
    const out: { d: Date; label: string }[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = -3; i <= 10; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      out.push({ d, label: d.toLocaleDateString("es-EC", { weekday: "short", day: "numeric" }) });
    }
    return out;
  }, []);

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

  const nombre = (profile?.nombre_completo || "").split(" ")[0] || "amiga";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mi Agenda Emprendedora</div>
      <h1 className="text-3xl font-semibold mb-1">Hola, <em className="not-italic" style={{ color: "var(--violet)" }}>{nombre}</em></h1>
      <p className="text-sm text-muted-foreground mb-5">Tu día, tu negocio y tu casa en un solo lugar.</p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {dias.map(({ d, label }) => {
          const v = d.toISOString().slice(0, 10);
          const sel = v === fecha;
          return (
            <button key={v} onClick={() => setFecha(v)}
              className="flex-shrink-0 px-3 py-2 rounded-xl border text-xs font-medium transition"
              style={sel
                ? { background: "var(--violet)", color: "white", borderColor: "var(--violet)" }
                : { background: "var(--card)" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{new Date(fecha + "T00:00").toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}</div>
        <button onClick={() => setOpen(true)} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-2"><Plus className="w-4 h-4"/> Actividad</button>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        {HORAS.map((h) => {
          const hh = String(h).padStart(2, "0") + ":00";
          const enHora = acts.filter((a) => parseInt(a.hora_inicio.slice(0, 2)) === h);
          return (
            <div key={h} className="flex border-t first:border-t-0 min-h-[64px]">
              <div className="w-16 px-3 py-3 text-xs font-mono text-muted-foreground">{hh}</div>
              <div className="flex-1 p-2 space-y-1.5">
                {enHora.map((a) => (
                  <div key={a.id} className="rounded-lg px-3 py-2 text-sm flex items-start justify-between gap-2"
                    style={{ background: (a.color ?? "#7C6BFF") + "22", borderLeft: `4px solid ${a.color ?? "#7C6BFF"}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{a.titulo}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{a.hora_inicio.slice(0,5)} · {a.duracion_min} min</span>
                        {a.ubicacion && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{a.ubicacion}</span>}
                        {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><LinkIcon className="w-3 h-3"/>link</a>}
                      </div>
                      {a.descripcion && <div className="text-[12px] mt-1 opacity-80">{a.descripcion}</div>}
                    </div>
                    <button onClick={() => borrar(a.id)} className="opacity-50 hover:opacity-100 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-card rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Nueva actividad · {fecha}</h3>
            <div className="space-y-2.5">
              <input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="px-3 py-2 rounded-lg border bg-background" />
                <input type="number" min="15" step="15" value={form.duracion_min} onChange={(e) => setForm({ ...form, duracion_min: +e.target.value })} className="px-3 py-2 rounded-lg border bg-background" placeholder="Min" />
              </div>
              <input placeholder="Ubicación (opcional)" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <input placeholder="Link Zoom/Meet (opcional)" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <textarea placeholder="Notas" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Color:</span>
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-10 h-10 rounded border" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={crear} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm disabled:opacity-60">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
