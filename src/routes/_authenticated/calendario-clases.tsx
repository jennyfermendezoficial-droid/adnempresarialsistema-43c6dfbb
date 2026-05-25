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
  const [form, setForm] = useState({ titulo: "", descripcion: "", hora_inicio: "10:00", hora_fin: "11:00" });

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

  const dayClases = (d: number) => {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return clases.filter((c) => c.fecha === date);
  };

  const crear = async () => {
    if (!newOn || !session) return;
    const start_time = `${newOn}T${form.hora_inicio}:00`;
    const [h1,m1] = form.hora_inicio.split(":").map(Number);
    const [h2,m2] = form.hora_fin.split(":").map(Number);
    const dur = (h2*60+m2) - (h1*60+m1);
    try {
      const zoom = await createZoom({ data: { topic: form.titulo, start_time, duration: Math.max(15, dur) } });
      const { data, error } = await supabase.from("clases_en_vivo").insert({
        fecha: newOn, hora_inicio: form.hora_inicio + ":00", hora_fin: form.hora_fin + ":00",
        titulo: form.titulo, descripcion: form.descripcion || null,
        zoom_meeting_id: zoom.meeting_id, zoom_link: zoom.join_url,
        profesor_id: session.user.id, created_by: session.user.id,
      }).select().single();
      if (error) throw error;
      setClases((c) => [...c, data as Clase]);
      setNewOn(null); setForm({ titulo: "", descripcion: "", hora_inicio: "10:00", hora_fin: "11:00" });
      toast.success("Clase creada con Zoom");
    } catch (e) { toast.error((e as Error).message); }
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar clase?")) return;
    const { error } = await supabase.from("clases_en_vivo").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setClases((c) => c.filter((x) => x.id !== id));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Calendario de clases</h1>
          <p className="text-sm text-muted-foreground">Clases en vivo con Zoom automático.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-lg border hover:bg-muted"><ChevronLeft className="w-4 h-4"/></button>
          <div className="text-sm font-medium capitalize w-40 text-center">{cursor.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</div>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-lg border hover:bg-muted"><ChevronRight className="w-4 h-4"/></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-2xl overflow-hidden border bg-border">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 text-xs font-semibold">{d}</div>
        ))}
        {Array.from({ length: startWeekday }).map((_, i) => <div key={"e"+i} className="bg-card min-h-24" />)}
        {Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).map((d) => (
          <div key={d} className="bg-card p-2 min-h-24 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{d}</span>
              {isStaff && (
                <button onClick={() => setNewOn(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`)} className="p-0.5 rounded hover:bg-muted opacity-50 hover:opacity-100"><Plus className="w-3 h-3"/></button>
              )}
            </div>
            {dayClases(d).map((c) => (
              <div key={c.id} className="text-[10px] rounded p-1 bg-violet-gradient text-white">
                <div className="font-semibold truncate">{c.titulo}</div>
                <div className="opacity-90">{c.hora_inicio.slice(0,5)}</div>
                {c.zoom_link && <a href={c.zoom_link} target="_blank" rel="noreferrer" className="underline flex items-center gap-0.5"><Video className="w-2.5 h-2.5"/>Zoom</a>}
                {isStaff && <button onClick={() => eliminar(c.id)} className="underline mt-0.5 flex items-center gap-0.5"><Trash2 className="w-2.5 h-2.5"/>Eliminar</button>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {newOn && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setNewOn(null)}>
          <div className="bg-card p-6 rounded-2xl max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Nueva clase</h3>
            <p className="text-xs text-muted-foreground">{new Date(newOn).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
            <input placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
            <textarea placeholder="Descripción (opcional)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="px-3 py-2 rounded-lg border bg-background" />
              <input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} className="px-3 py-2 rounded-lg border bg-background" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setNewOn(null)} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button disabled={!form.titulo} onClick={crear} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-50">Crear con Zoom</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
