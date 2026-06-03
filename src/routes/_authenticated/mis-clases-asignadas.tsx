import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Video, Calendar, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mis-clases-asignadas")({ component: Page });

interface Clase { id: string; fecha: string; hora_inicio: string; hora_fin: string; titulo: string; descripcion: string | null; zoom_link: string | null; profesor_id: string | null }
interface Sesion { id: string; fecha: string; hora_inicio: string; hora_fin: string; profesor_id: string; alumna_id: string; zoom_link: string | null; estado: string }
interface Profile { id: string; nombre_completo: string; email: string }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [clases, setClases] = useState<Clase[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [alumnas, setAlumnas] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !isStaff) return;
    (async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const [{ data: c }, { data: s }] = await Promise.all([
        supabase.from("clases_en_vivo").select("*").eq("profesor_id", uid).gte("fecha", hoy).order("fecha").order("hora_inicio"),
        supabase.from("sesiones_1a1").select("*").eq("profesor_id", uid).gte("fecha", hoy).order("fecha").order("hora_inicio"),
      ]);
      const cl = (c as Clase[]) ?? [];
      const se = (s as Sesion[]) ?? [];
      setClases(cl);
      setSesiones(se);
      const ids = Array.from(new Set(se.map((x) => x.alumna_id)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", ids);
        const map: Record<string, Profile> = {};
        ((ps as Profile[]) ?? []).forEach((p) => { map[p.id] = p; });
        setAlumnas(map);
      }
      setLoading(false);
    })();
  }, [uid, isStaff]);

  if (!isStaff) return <div className="p-8 text-center text-muted-foreground">Solo para profesores (admin o soporte).</div>;

  const ahora = new Date();
  const dentroDe24h = (fecha: string, hora: string) => {
    const d = new Date(`${fecha}T${hora}`);
    const diff = d.getTime() - ahora.getTime();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  type Item = { tipo: "clase" | "1a1"; id: string; fecha: string; hora: string; titulo: string; sub: string; link: string | null };
  const items: Item[] = [
    ...clases.map<Item>((c) => ({ tipo: "clase", id: c.id, fecha: c.fecha, hora: c.hora_inicio, titulo: c.titulo, sub: c.descripcion || "Clase en vivo", link: c.zoom_link })),
    ...sesiones.map<Item>((s) => {
      const al = alumnas[s.alumna_id];
      return { tipo: "1a1", id: s.id, fecha: s.fecha, hora: s.hora_inicio, titulo: `1 a 1 con ${al?.nombre_completo || al?.email || "alumna"}`, sub: "Sesión privada", link: s.zoom_link };
    }),
  ].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Para profesores</div>
        <h1 className="text-3xl font-bold mt-1">Mis clases asignadas</h1>
        <p className="text-sm opacity-90 mt-1">Aquí ves todas las clases en vivo y sesiones 1 a 1 que te tocan dictar.</p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border rounded-2xl">No tienes clases ni sesiones próximas.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const proximo = dentroDe24h(it.fecha, it.hora);
            return (
              <div key={`${it.tipo}-${it.id}`} className="rounded-2xl border bg-card p-4 flex items-center gap-3 flex-wrap shadow-sm"
                style={proximo ? { borderColor: "var(--violet)", boxShadow: "0 4px 16px rgba(124,107,255,.15)" } : undefined}>
                <div className="w-12 h-12 rounded-xl grid place-items-center text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
                  {it.tipo === "clase" ? <Calendar className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{it.titulo}</h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: it.tipo === "clase" ? "rgba(124,107,255,.12)" : "rgba(34,197,94,.12)", color: it.tipo === "clase" ? "var(--violet)" : "#16a34a" }}>
                      {it.tipo === "clase" ? "Clase en vivo" : "1 a 1"}
                    </span>
                    {proximo && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        style={{ background: "rgba(245,158,11,.15)", color: "#d97706" }}>
                        <AlertCircle className="w-3 h-3" /> En menos de 24h
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {new Date(it.fecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} · {it.hora.slice(0,5)}
                  </p>
                  {it.sub && <p className="text-xs mt-1 opacity-80 line-clamp-2">{it.sub}</p>}
                </div>
                {it.link && (
                  <a href={it.link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-violet-gradient text-white">
                    <Video className="w-3.5 h-3.5" /> Entrar a Zoom
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}