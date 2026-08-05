import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Video, Calendar, AlertCircle, Clock, Trash2 } from "lucide-react";
import { RegistrarDuracionModal } from "@/components/RegistrarDuracionModal";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/mis-clases-asignadas")({ component: Page });

interface Clase { id: string; fecha: string; hora_inicio: string; hora_fin: string; titulo: string; descripcion: string | null; zoom_link: string | null; profesor_id: string | null; duracion_min: number | null }
interface Sesion { id: string; fecha: string; hora_inicio: string; hora_fin: string | null; profesor_id: string; alumna_id: string; zoom_link: string | null; estado: string; motivo: string | null; duracion_min: number | null }
interface Profile { id: string; nombre_completo: string; email: string }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [clases, setClases] = useState<Clase[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [personas, setPersonas] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [duracionModal, setDuracionModal] = useState<Sesion | null>(null);
  const [claseModal, setClaseModal] = useState<Clase | null>(null);
  const [borrarSesion, setBorrarSesion] = useState<Sesion | null>(null);
  const [borrando, setBorrando] = useState(false);

  const eliminarSesion = async () => {
    if (!borrarSesion) return;
    setBorrando(true);
    const { error } = await supabase.from("sesiones_1a1").delete().eq("id", borrarSesion.id);
    setBorrando(false);
    if (error) {
      toast.error("No se pudo eliminar la sesión");
      return;
    }
    setSesiones((arr) => arr.filter((x) => x.id !== borrarSesion.id));
    setBorrarSesion(null);
    toast.success("Sesión eliminada");
  };

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      // El staff ve también las clases pasadas recientes para poder registrar su duración
      const desde = isStaff
        ? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
        : hoy;
      const clasesQuery = supabase.from("clases_en_vivo").select("*").gte("fecha", desde).order("fecha").order("hora_inicio");
      const [{ data: c }, { data: s }] = await Promise.all([
        isStaff ? clasesQuery.eq("profesor_id", uid) : clasesQuery,
        supabase.from("sesiones_1a1").select("*").or(`alumna_id.eq.${uid},profesor_id.eq.${uid}`).order("fecha", { ascending: false }).order("hora_inicio"),
      ]);
      const cl = (c as Clase[]) ?? [];
      const se = (s as Sesion[]) ?? [];
      setClases(cl);
      setSesiones(se);
      const ids = Array.from(new Set(se.flatMap((x) => [x.alumna_id, x.profesor_id]).filter((id) => id !== uid)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", ids);
        const map: Record<string, Profile> = {};
        ((ps as Profile[]) ?? []).forEach((p) => { map[p.id] = p; });
        setPersonas(map);
      }
      setLoading(false);
    })();
  }, [uid, isStaff]);

  const ahora = new Date();
  const dentroDe24h = (fecha: string, hora: string) => {
    const d = new Date(`${fecha}T${hora}`);
    const diff = d.getTime() - ahora.getTime();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  type Item = { tipo: "clase" | "1a1"; id: string; fecha: string; hora: string; titulo: string; sub: string; link: string | null; motivo?: string | null; soyProfe?: boolean; sesion?: Sesion; clase?: Clase };
  const items: Item[] = [
    ...clases.map<Item>((c) => ({
      tipo: "clase", id: c.id, fecha: c.fecha, hora: c.hora_inicio, titulo: c.titulo,
      sub: c.duracion_min
        ? `${c.descripcion || "Clase en vivo"} · ${c.hora_inicio.slice(0,5)} – ${c.hora_fin?.slice(0,5)} · ${c.duracion_min} min`
        : (c.descripcion || "Clase en vivo"),
      link: c.zoom_link, soyProfe: c.profesor_id === uid, clase: c,
    })),
    ...sesiones.map<Item>((s) => {
      const soyAlumna = s.alumna_id === uid;
      const persona = personas[soyAlumna ? s.profesor_id : s.alumna_id];
      const nombre = persona?.nombre_completo || persona?.email || (soyAlumna ? "mentor" : "estudiante");
      return {
        tipo: "1a1", id: s.id, fecha: s.fecha, hora: s.hora_inicio,
        titulo: soyAlumna ? `1 a 1 con ${nombre}` : `1 a 1 · ${nombre}`,
        sub: s.duracion_min ? `Sesión privada · ${s.hora_inicio.slice(0,5)} – ${s.hora_fin?.slice(0,5)} · ${s.duracion_min} min` : "Sesión privada · duración por definir",
        link: s.zoom_link, motivo: s.motivo, soyProfe: !soyAlumna, sesion: s,
      };
    }),
  ].sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Agenda personal</div>
        <h1 className="text-3xl font-bold mt-1">Mis clases asignadas</h1>
        <p className="text-sm opacity-90 mt-1">Aquí ves tus clases en vivo y sesiones 1 a 1 próximas.</p>
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
                  {it.tipo === "1a1" && it.motivo && (
                    <div className="mt-2 p-2 rounded-lg border-l-2 text-xs" style={{ borderColor: "var(--violet)", background: "rgba(124,107,255,.06)" }}>
                      <div className="text-[10px] uppercase tracking-wider font-bold opacity-70 mb-0.5">
                        {it.soyProfe ? "Duda de la alumna" : "Tu duda / inquietud"}
                      </div>
                      <div className="opacity-90">{it.motivo}</div>
                    </div>
                  )}
                </div>
                {it.link && (
                  <a href={it.link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-violet-gradient text-white">
                    <Video className="w-3.5 h-3.5" /> Entrar a Zoom
                  </a>
                )}
                {it.tipo === "1a1" && it.soyProfe && it.sesion && (
                  <button onClick={() => setDuracionModal(it.sesion!)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border">
                    <Clock className="w-3.5 h-3.5" /> {it.sesion.duracion_min ? "Editar duración" : "Registrar duración"}
                  </button>
                )}
                {it.tipo === "1a1" && it.sesion && it.sesion.estado !== "finalizada" && (it.soyProfe || role === "admin") && (
                  <button onClick={() => setBorrarSesion(it.sesion!)} title="Eliminar sesión"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border text-destructive border-destructive/40 hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </button>
                )}
                {it.tipo === "clase" && it.clase && (it.clase.profesor_id === uid || role === "admin") && new Date(`${it.fecha}T${it.hora}`) <= ahora && (
                  <button onClick={() => setClaseModal(it.clase!)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border">
                    <Clock className="w-3.5 h-3.5" /> {it.clase.duracion_min ? "Editar duración" : "Registrar duración"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {duracionModal && (
        <RegistrarDuracionModal
          sesionId={duracionModal.id}
          horaInicio={duracionModal.hora_inicio}
          onClose={() => setDuracionModal(null)}
          onSaved={(min, fin) => setSesiones((arr) => arr.map((x) => x.id === duracionModal.id ? { ...x, duracion_min: min, hora_fin: fin + ":00", estado: "finalizada" } : x))}
        />
      )}

      {claseModal && (
        <RegistrarDuracionModal
          tipo="clase"
          sesionId={claseModal.id}
          horaInicio={claseModal.hora_inicio}
          duracionInicial={claseModal.duracion_min}
          onClose={() => setClaseModal(null)}
          onSaved={(min, fin) => setClases((arr) => arr.map((x) => x.id === claseModal.id ? { ...x, duracion_min: min, hora_fin: fin + ":00" } : x))}
        />
      )}

      <AlertDialog open={!!borrarSesion} onOpenChange={(o) => !o && setBorrarSesion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              La alumna dejará de verla en su agenda. Úsalo solo si la sesión no se realizó.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void eliminarSesion(); }} disabled={borrando}>
              {borrando ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}