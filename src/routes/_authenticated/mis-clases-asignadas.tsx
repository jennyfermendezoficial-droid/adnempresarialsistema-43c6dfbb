import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Video, Calendar, AlertCircle, Clock, Trash2, UserPlus, FileText, List, CalendarDays } from "lucide-react";
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
  const [vista, setVista] = useState<"lista" | "calendario">("calendario");
  const [diaSel, setDiaSel] = useState<string | null>(null);
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
    if (error) { toast.error(error.message); return; }
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

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
          className="px-3 py-2 rounded-lg border bg-background text-sm">
          {meses.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="flex gap-1 p-1 rounded-lg border bg-card">
          <button onClick={() => setVista("calendario")}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${vista === "calendario" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>
            <CalendarDays className="w-3.5 h-3.5" /> Calendario
          </button>
          <button onClick={() => setVista("lista")}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${vista === "lista" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>
            <List className="w-3.5 h-3.5" /> Lista
          </button>
        </div>
        <button onClick={() => void descargarInforme()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold">
          <FileText className="w-4 h-4" /> Descargar mi informe PDF
        </button>
      </div>

      {vista === "calendario" && !loading && (
        <CalendarioMes
          anio={anioSel} mes={mesSel} items={items}
          diaSel={diaSel} onDia={(d) => setDiaSel(d === diaSel ? null : d)}
        />
      )}

      {vista === "calendario" && !loading && reemplazos.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Reemplazos que reportaste este mes</div>
          <div className="space-y-1.5">
            {reemplazos.map((r) => (
              <div key={r.id} className="text-sm flex gap-2 items-start">
                <span className="text-[11px] uppercase opacity-60 w-14 pt-0.5">
                  {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                </span>
                <span className="flex-1">
                  {r.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1"} ·{" "}
                  <span className="text-muted-foreground">
                    reemplazaste a {formatNombre(profesores.find((p) => p.id === r.profesor_reemplazado)?.nombre_completo) || "otro profesor"}
                  </span>
                  {r.nota && <span className="block text-xs text-muted-foreground">{r.nota}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border rounded-2xl">No tienes clases ni sesiones próximas.</div>
      ) : (
        <div className="space-y-2">
          {(vista === "calendario" ? items.filter((it) => !diaSel || it.fecha === diaSel) : items).map((it) => {
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
                {it.soyProfe && (
                  <button
                    onClick={() => setReemplazoModal({ tipo: it.tipo, id: it.id, fecha: it.fecha, titulo: it.titulo })}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border">
                    <UserPlus className="w-3.5 h-3.5" /> Reportar reemplazo
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reemplazoModal && (
        <ReemplazoModal
          titulo={reemplazoModal.titulo}
          profesores={profesores}
          onClose={() => setReemplazoModal(null)}
          onSave={guardarReemplazo}
        />
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
interface CalItem { tipo: "clase" | "1a1"; id: string; fecha: string; hora: string; titulo: string }

function CalendarioMes({ anio, mes, items, diaSel, onDia }: {
  anio: number; mes: number; items: CalItem[]; diaSel: string | null; onDia: (fecha: string) => void;
}) {
  const primero = new Date(anio, mes - 1, 1);
  const offset = primero.getDay();
  const dias = new Date(anio, mes, 0).getDate();
  const celdas: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: dias }, (_, i) => `${anio}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border bg-card p-4 mb-4">
      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d) => <div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((fecha, i) => {
          if (!fecha) return <div key={`v${i}`} />;
          const delDia = items.filter((x) => x.fecha === fecha);
          const activo = diaSel === fecha;
          return (
            <button key={fecha} onClick={() => onDia(fecha)}
              className={`min-h-[64px] rounded-xl border p-1.5 text-left transition ${activo ? "border-violet bg-violet/10" : "hover:bg-muted/40"}`}
              style={activo ? { borderColor: "var(--violet)" } : undefined}>
              <div className={`text-[11px] font-semibold ${fecha === hoy ? "text-violet" : ""}`} style={fecha === hoy ? { color: "var(--violet)" } : undefined}>
                {Number(fecha.slice(8))}
              </div>
              <div className="space-y-0.5 mt-0.5">
                {delDia.slice(0, 2).map((x) => (
                  <div key={x.id} className="text-[9px] leading-tight truncate rounded px-1 py-0.5 text-white"
                    style={{ background: x.tipo === "clase" ? "var(--violet)" : "#16a34a" }}>
                    {x.hora.slice(0, 5)} {x.titulo}
                  </div>
                ))}
                {delDia.length > 2 && <div className="text-[9px] text-muted-foreground">+{delDia.length - 2} más</div>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Toca un día para ver solo esas clases abajo y reportar quién te reemplazó o registrar la duración.
      </p>
    </div>
  );
}

function ReemplazoModal({ titulo, profesores, onClose, onSave }: {
  titulo: string;
  profesores: Profile[];
  onClose: () => void;
  onSave: (profesorId: string, nota: string) => Promise<void>;
}) {
  const [profesorId, setProfesorId] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Reportar reemplazo</h3>
        <p className="text-xs text-muted-foreground mt-1">{titulo}</p>
        <label className="block text-xs font-semibold mt-4 mb-1">¿A qué profesor reemplazaste?</label>
        <select value={profesorId} onChange={(e) => setProfesorId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
          <option value="">Selecciona…</option>
          {profesores.map((p) => (
            <option key={p.id} value={p.id}>{formatNombre(p.nombre_completo) || p.email}</option>
          ))}
        </select>
        <label className="block text-xs font-semibold mt-3 mb-1">Nota (opcional)</label>
        <textarea value={nota} onChange={(e) => setNota(e.target.value.slice(0, 300))} rows={3}
          placeholder="Ej: cubrí la clase por viaje del profe"
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={guardando} className="px-3 py-2 rounded-lg border text-sm">Cancelar</button>
          <button
            disabled={!profesorId || guardando}
            onClick={async () => { setGuardando(true); await onSave(profesorId, nota); setGuardando(false); }}
            className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-50">
            {guardando ? "Guardando…" : "Reportar"}
          </button>
        </div>
      </div>
    </div>
  );
}
