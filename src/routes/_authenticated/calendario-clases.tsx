import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createZoomMeeting } from "@/lib/zoom.functions";
import { ChevronLeft, ChevronRight, Plus, Video, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendario-clases")({ component: Page });

interface Clase { id: string; fecha: string; hora_inicio: string; hora_fin: string; titulo: string; descripcion: string | null; zoom_link: string | null; profesor_id: string | null }

function Page() {
  const { session, role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const createZoom = useServerFn(createZoomMeeting);
  const [cursor, setCursor] = useState(new Date());
  const [clases, setClases] = useState<Clase[]>([]);
  const [newOn, setNewOn] = useState<string | null>(null);
  const [staff, setStaff] = useState<{ id: string; nombre: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    hora_inicio: "10:00",
    hora_fin: "11:00",
    repetir: false,
    repetir_hasta: "",
    profesor_id: "",
  });

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const startWeekday = (monthStart.getDay() + 6) % 7;

  useEffect(() => {
    supabase.from("clases_en_vivo")
      .select("*")
      .gte("fecha", monthStart.toISOString().slice(0, 10))
      .lte("fecha", monthEnd.toISOString().slice(0, 10))
      .order("fecha").order("hora_inicio")
      .then(({ data }) => setClases((data as Clase[]) ?? []));
  }, [cursor]); // eslint-disable-line

  // Cargar mentores (admin + soporte) para asignar quien dicta la clase
  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin", "soporte"]);
      const ids = Array.from(new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)));
      if (!ids.length) return;
      const { data: ps } = await supabase.from("profiles").select("id, nombre_completo, email").in("id", ids);
      setStaff((ps ?? []).map((p: { id: string; nombre_completo: string; email: string }) => ({ id: p.id, nombre: p.nombre_completo || p.email })));
    })();
  }, []);

  const dayClases = (d: number) => {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return clases.filter((c) => c.fecha === date);
  };

  const crear = async () => {
    if (!newOn || !session || creating) return;
    setCreating(true);
    const [h1,m1] = form.hora_inicio.split(":").map(Number);
    const [h2,m2] = form.hora_fin.split(":").map(Number);
    const dur = (h2*60+m2) - (h1*60+m1);
    try {
      // Construir todas las fechas (una o varias si es semanal)
      const fechas: string[] = [newOn];
      if (form.repetir && form.repetir_hasta) {
        const desde = new Date(newOn);
        const hasta = new Date(form.repetir_hasta);
        const cursor2 = new Date(desde);
        cursor2.setDate(cursor2.getDate() + 7);
        while (cursor2 <= hasta) {
          fechas.push(cursor2.toISOString().slice(0, 10));
          cursor2.setDate(cursor2.getDate() + 7);
        }
      }
      // Nombre del profesor que dicta
      const profId = form.profesor_id || session.user.id;
      const prof = staff.find((s) => s.id === profId);
      const nombreProf = prof?.nombre || "Profesor";
      const topic = `${form.titulo} – ${nombreProf}`;
      const agenda = form.descripcion
        ? `${form.descripcion}\n\nDicta: ${nombreProf}`
        : `Dicta: ${nombreProf}`;
      const nuevas: Clase[] = [];
      for (const f of fechas) {
        const zoom = await createZoom({ data: { topic, start_time: `${f}T${form.hora_inicio}:00`, duration: Math.max(15, dur), agenda, purpose: "class" } });
        const { data, error } = await supabase.from("clases_en_vivo").insert({
          fecha: f, hora_inicio: form.hora_inicio + ":00", hora_fin: form.hora_fin + ":00",
          titulo: form.titulo, descripcion: form.descripcion || null,
          zoom_meeting_id: zoom.meeting_id, zoom_link: zoom.join_url,
          profesor_id: profId, created_by: session.user.id,
        }).select().single();
        if (error) throw error;
        nuevas.push(data as Clase);
      }
      setClases((c) => [...c, ...nuevas]);
      setNewOn(null);
      setForm({ titulo: "", descripcion: "", hora_inicio: "10:00", hora_fin: "11:00", repetir: false, repetir_hasta: "", profesor_id: "" });
      toast.success(nuevas.length > 1 ? `${nuevas.length} clases creadas (con Zoom)` : "Clase creada con Zoom");
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar clase?")) return;
    const { error } = await supabase.from("clases_en_vivo").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setClases((c) => c.filter((x) => x.id !== id));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div aria-hidden className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Clases en vivo</div>
            <h1 className="text-3xl font-bold mt-1">Calendario de clases</h1>
            <p className="text-sm opacity-90 mt-1">Programa clases con Zoom automático. Activa repetición semanal para series fijas.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronLeft className="w-4 h-4"/></button>
            <div className="text-sm font-semibold capitalize w-40 text-center">{cursor.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</div>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-3xl overflow-hidden border bg-border shadow-sm">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((d) => (
          <div key={d} className="bg-muted px-2 py-2 text-[11px] font-semibold uppercase tracking-wider opacity-80">{d}</div>
        ))}
        {Array.from({ length: startWeekday }).map((_, i) => <div key={"e"+i} className="bg-card min-h-24" />)}
        {Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).map((d) => (
          <div key={d} className="bg-card p-2 min-h-28 flex flex-col gap-1 hover:bg-muted/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold opacity-70">{d}</span>
              {isStaff && (
                <button onClick={() => setNewOn(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`)} className="p-1 rounded-md hover:bg-violet/15 text-violet opacity-60 hover:opacity-100 transition"><Plus className="w-3 h-3"/></button>
              )}
            </div>
            {dayClases(d).map((c) => (
              <div key={c.id} title={c.descripcion ?? c.titulo} className="text-[10px] rounded-lg p-1.5 bg-violet-gradient text-white shadow-sm">
                <div className="font-semibold truncate">{c.titulo}</div>
                <div className="opacity-90">{c.hora_inicio.slice(0,5)}</div>
                {c.descripcion && (
                  <div className="opacity-90 line-clamp-2 mt-0.5">{c.descripcion}</div>
                )}
                {c.zoom_link && <a href={c.zoom_link} target="_blank" rel="noreferrer" className="underline flex items-center gap-0.5"><Video className="w-2.5 h-2.5"/>Zoom</a>}
                {isStaff && <button onClick={() => eliminar(c.id)} className="underline mt-0.5 flex items-center gap-0.5"><Trash2 className="w-2.5 h-2.5"/>Eliminar</button>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {newOn && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setNewOn(null)}>
          <div className="bg-card p-6 rounded-3xl max-w-md w-full space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Nueva clase</h3>
            <p className="text-xs text-muted-foreground capitalize">{new Date(newOn + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
            <input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
            <textarea placeholder="Descripción (opcional)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" rows={2} />
            <div>
              <label className="text-xs opacity-70 mb-1 block">Profesor que dicta</label>
              <select value={form.profesor_id} onChange={(e) => setForm({ ...form, profesor_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background">
                <option value="">— Yo mismo —</option>
                {staff.filter((s) => s.id !== session?.user.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="px-3 py-2 rounded-lg border bg-background" />
              <input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} className="px-3 py-2 rounded-lg border bg-background" />
            </div>
            <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.repetir} onChange={(e) => setForm({ ...form, repetir: e.target.checked })} className="accent-violet" />
                <span className="font-medium">Repetir cada semana</span>
                <span className="opacity-60 text-xs">(mismo día de la semana)</span>
              </label>
              {form.repetir && (
                <label className="flex items-center gap-2 text-xs">
                  <span className="opacity-70">Hasta:</span>
                  <input type="date" value={form.repetir_hasta} min={newOn} onChange={(e) => setForm({ ...form, repetir_hasta: e.target.value })} className="px-2 py-1 rounded-md border bg-background flex-1" />
                </label>
              )}
              <p className="text-[11px] opacity-60">Se crearán clases independientes cada semana. Puedes editar o eliminar cualquiera por separado (por ej. cambiar el nombre del próximo lunes).</p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button disabled={creating} onClick={() => setNewOn(null)} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button disabled={creating || !form.titulo || (form.repetir && !form.repetir_hasta)} onClick={crear} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-50">
                {creating ? "Creando…" : "Crear con Zoom"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
