import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Video, Calendar, AlertCircle, Clock, Trash2, UserPlus, FileText } from "lucide-react";
import { RegistrarDuracionModal } from "@/components/RegistrarDuracionModal";
import { formatNombre } from "@/lib/nombres";
import { toast } from "sonner";
import { listaMeses, generarInformeProfesorPDF, type InformeItem, type InformeReemplazo } from "@/lib/pagos-export";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/mis-clases-asignadas")({ component: Page });

interface Clase { id: string; fecha: string; hora_inicio: string; hora_fin: string; titulo: string; descripcion: string | null; zoom_link: string | null; profesor_id: string | null; duracion_min: number | null }
interface Sesion { id: string; fecha: string; hora_inicio: string; hora_fin: string | null; profesor_id: string; alumna_id: string; zoom_link: string | null; estado: string; motivo: string | null; duracion_min: number | null }
interface Profile { id: string; nombre_completo: string; email: string }
interface Reemplazo { id: string; tipo: string; referencia_id: string; profesor_reemplazado: string; fecha: string; nota: string | null }

const hoyDate = new Date();

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const meses = listaMeses();
  const [periodo, setPeriodo] = useState(`${hoyDate.getFullYear()}-${String(hoyDate.getMonth() + 1).padStart(2, "0")}`);
  const [anioSel, mesSel] = [Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7))];
  const [clases, setClases] = useState<Clase[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [personas, setPersonas] = useState<Record<string, Profile>>({});
  const [profesores, setProfesores] = useState<Profile[]>([]);
  const [reemplazos, setReemplazos] = useState<Reemplazo[]>([]);
  const [reemplazoModal, setReemplazoModal] = useState<{ tipo: "clase" | "1a1"; id: string; fecha: string; titulo: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [duracionModal, setDuracionModal] = useState<Sesion | null>(null);
  const [claseModal, setClaseModal] = useState<Clase | null>(null);
  const [borrarSesion, setBorrarSesion] = useState<Sesion | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [razon, setRazon] = useState("");

  const eliminarSesion = async () => {
    if (!borrarSesion) return;
    if (razon.trim().length < 5) {
      toast.error("Escribe la razón (mínimo 5 caracteres)");
      return;
    }
    setBorrando(true);
    const { error } = await supabase.rpc("cancelar_sesion_1a1", { _id: borrarSesion.id, _razon: razon.trim() });
    setBorrando(false);
    if (error) {
      toast.error(error.message || "No se pudo eliminar la sesión");
      return;
    }
    setSesiones((arr) => arr.filter((x) => x.id !== borrarSesion.id));
    setBorrarSesion(null);
    setRazon("");
    toast.success("Sesión eliminada · queda registrada en informes");
  };

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    (async () => {
      const desde = `${anioSel}-${String(mesSel).padStart(2, "0")}-01`;
      const ultimo = new Date(anioSel, mesSel, 0).getDate();
      const hasta = `${anioSel}-${String(mesSel).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
      const [{ data: c }, { data: s }, { data: r }] = await Promise.all([
        supabase.from("clases_en_vivo").select("*").gte("fecha", desde).lte("fecha", hasta)
          .eq("profesor_id", uid).order("fecha").order("hora_inicio"),
        supabase.from("sesiones_1a1").select("*").gte("fecha", desde).lte("fecha", hasta)
          .or(`alumna_id.eq.${uid},profesor_id.eq.${uid}`).order("fecha", { ascending: false }).order("hora_inicio"),
        supabase.from("reemplazos_clase").select("*").eq("profesor_reporta", uid).gte("fecha", desde).lte("fecha", hasta),
      ]);
      // Solo lo mío: nunca clases ni sesiones de otras personas, aunque el rol permita verlas
      const cl = ((c as Clase[]) ?? []).filter((x) => x.profesor_id === uid);
      const se = ((s as Sesion[]) ?? []).filter((x) => x.profesor_id === uid || x.alumna_id === uid);
      setClases(cl);
      setSesiones(se);
      setReemplazos(((r as Reemplazo[]) ?? []));
      const ids = Array.from(new Set(se.flatMap((x) => [x.alumna_id, x.profesor_id]).filter((id) => id !== uid)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", ids);
        const map: Record<string, Profile> = {};
        ((ps as Profile[]) ?? []).forEach((p) => { map[p.id] = p; });
        setPersonas(map);
      }
      setLoading(false);
    })();
  }, [uid, isStaff, anioSel, mesSel]);

  useEffect(() => {
    supabase.rpc("listar_profesores").then(({ data }) => {
      setProfesores(((data ?? []) as Profile[]).filter((p) => p.id !== uid));
    });
  }, [uid]);

  const descargarInforme = async () => {
    if (!uid) return;
    const { data: precios } = await supabase.from("pagos_items_precio")
      .select("tipo,referencia_id,monto").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel);
    const precioDe = (tipo: string, id: string) =>
      Number(((precios ?? []) as { tipo: string; referencia_id: string; monto: number }[])
        .find((p) => p.tipo === tipo && p.referencia_id === id)?.monto ?? 0);

    const items: InformeItem[] = [
      ...clases.filter((c) => c.profesor_id === uid).map((c) => ({
        fecha: c.fecha, tipo: "Clase en vivo", detalle: c.titulo,
        horaInicio: c.hora_inicio.slice(0, 5), horaFin: (c.hora_fin ?? "").slice(0, 5),
        minutos: c.duracion_min ?? 0, monto: precioDe("clase", c.id),
      })),
      ...sesiones.filter((s) => s.profesor_id === uid).map((s) => ({
        fecha: s.fecha, tipo: "Sesión 1:1",
        detalle: formatNombre(personas[s.alumna_id]?.nombre_completo) || personas[s.alumna_id]?.email || "Estudiante",
        horaInicio: s.hora_inicio.slice(0, 5), horaFin: (s.hora_fin ?? "").slice(0, 5),
        minutos: s.duracion_min ?? 0, monto: precioDe("1a1", s.id),
      })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha));

    const reps: InformeReemplazo[] = reemplazos.map((r) => ({
      fecha: r.fecha,
      detalle: r.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1",
      profesor: formatNombre(profesores.find((p) => p.id === r.profesor_reemplazado)?.nombre_completo) || "otro profesor",
      nota: r.nota ?? "",
    }));

    const { data: aj } = await supabase.from("pagos_ajustes")
      .select("minutos").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel).maybeSingle();

    generarInformeProfesorPDF({
      nombre: formatNombre(session?.user.user_metadata?.nombre_completo as string | undefined) || session?.user.email || "Profesor",
      tema: "", mes: mesSel, anio: anioSel, items, reemplazos: reps,
      bonos: 0, ajusteMin: Number((aj as { minutos: number } | null)?.minutos ?? 0),
      total: items.reduce((a, i) => a + i.monto, 0), califPromedio: 0, califCount: 0,
    });
  };

  const guardarReemplazo = async (profesorId: string, nota: string) => {
    if (!reemplazoModal || !uid) return;
    const { error } = await supabase.from("reemplazos_clase").insert({
      tipo: reemplazoModal.tipo, referencia_id: reemplazoModal.id,
      profesor_reporta: uid, profesor_reemplazado: profesorId,
      fecha: reemplazoModal.fecha, nota: nota.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Reemplazo reportado");
    setReemplazoModal(null);
    const { data: r } = await supabase.from("reemplazos_clase").select("*").eq("profesor_reporta", uid);
    setReemplazos(((r as Reemplazo[]) ?? []));
  };

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
      const soyProfesor = s.profesor_id === uid;
      const persona = personas[soyAlumna ? s.profesor_id : s.alumna_id];
      const nombre = formatNombre(persona?.nombre_completo) || persona?.email || (soyAlumna ? "mentor" : "estudiante");
      return {
        tipo: "1a1", id: s.id, fecha: s.fecha, hora: s.hora_inicio,
        titulo: soyAlumna ? `1 a 1 con ${nombre}` : `1 a 1 · ${nombre}`,
        sub: s.duracion_min ? `Sesión privada · ${s.hora_inicio.slice(0,5)} – ${s.hora_fin?.slice(0,5)} · ${s.duracion_min} min` : "Sesión privada · duración por definir",
        link: s.zoom_link, motivo: s.motivo, soyProfe: soyProfesor, sesion: s,
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
                {it.tipo === "1a1" && it.sesion && it.sesion.estado !== "finalizada" && it.soyProfe && (
                  <button onClick={() => { setBorrarSesion(it.sesion!); setRazon(""); }} title="Eliminar sesión"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border text-destructive border-destructive/40 hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </button>
                )}
                {it.tipo === "clase" && it.clase && it.clase.profesor_id === uid && new Date(`${it.fecha}T${it.hora}`) <= ahora && (
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
          onSaved={(min, fin, ini) => setSesiones((arr) => arr.map((x) => x.id === duracionModal.id ? { ...x, duracion_min: min, hora_inicio: ini + ":00", hora_fin: fin + ":00", estado: "finalizada" } : x))}
        />
      )}

      {claseModal && (
        <RegistrarDuracionModal
          tipo="clase"
          sesionId={claseModal.id}
          horaInicio={claseModal.hora_inicio}
          duracionInicial={claseModal.duracion_min}
          onClose={() => setClaseModal(null)}
          onSaved={(min, fin, ini) => setClases((arr) => arr.map((x) => x.id === claseModal.id ? { ...x, duracion_min: min, hora_inicio: ini + ":00", hora_fin: fin + ":00" } : x))}
        />
      )}

      <AlertDialog open={!!borrarSesion} onOpenChange={(o) => { if (!o) { setBorrarSesion(null); setRazon(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              La alumna dejará de verla en su agenda. Escribe la razón (por ejemplo: "no se realizó la clase");
              quedará registrada en Pagos e informes y no cuenta horas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea value={razon} onChange={(e) => setRazon(e.target.value.slice(0, 300))} rows={3} maxLength={300}
            placeholder="Razón…" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void eliminarSesion(); }} disabled={borrando || razon.trim().length < 5}>
              {borrando ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}