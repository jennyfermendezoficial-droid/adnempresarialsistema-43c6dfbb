import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, Clock3, Loader2, Trash2, Video, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RegistrarDuracionModal } from "@/components/RegistrarDuracionModal";
import { fetchPerfiles } from "@/lib/perfiles";
import { formatNombre } from "@/lib/nombres";
import { fechaHoyEcuador, sesion1a1Terminada } from "@/lib/sesion-1a1-tiempo";
import { toast } from "sonner";

interface ClasePendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  titulo: string;
  duracion_min: number | null;
}

interface SesionPendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  profesor_id: string;
  alumna_id: string;
  estado: string | null;
  motivo: string | null;
  duracion_min: number | null;
}

type Pendiente =
  | { tipo: "clase"; clase: ClasePendiente }
  | { tipo: "1a1"; sesion: SesionPendiente };

const MOTIVOS_NO_REALIZADA = [
  { value: "evento", label: "La alumna informó que tenía un evento" },
  { value: "consulta_medica", label: "La alumna tuvo una consulta médica" },
  { value: "no_asistio", label: "La alumna no pudo asistir" },
  { value: "profesor_no_pudo", label: "El profesor no pudo realizar la sesión" },
  { value: "reprogramada", label: "La sesión se cambió para otro día" },
  { value: "problema_personal", label: "La alumna tuvo un problema personal" },
  { value: "problema_tecnico", label: "Hubo un inconveniente técnico" },
  { value: "otro", label: "Otro motivo" },
] as const;

function fechaLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function termino(fecha: string, inicio: string, fin: string | null) {
  const i = new Date(`${fecha}T${inicio.slice(0, 5)}:00`);
  const f = fin ? new Date(`${fecha}T${fin.slice(0, 5)}:00`) : new Date(i.getTime() + 60 * 60_000);
  return f.getTime() <= Date.now();
}

function fechaBonita(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PendientesRegistroProfesorPanel() {
  const { session, role, roles } = useAuth();
  const uid = session?.user.id;
  const isProfesor = role === "soporte" || roles.includes("soporte");
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [alumnas, setAlumnas] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<Pendiente | null>(null);
  const [noRealizada, setNoRealizada] = useState<SesionPendiente | null>(null);
  const [motivoNoRealizada, setMotivoNoRealizada] = useState("");
  const [detalleNoRealizada, setDetalleNoRealizada] = useState("");
  const [guardandoNoRealizada, setGuardandoNoRealizada] = useState(false);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!uid || !isProfesor) {
      setPendientes([]);
      setLoading(false);
      return;
    }

    const hoy = fechaLocal();
    const hoyEcuador = fechaHoyEcuador();
    const [clasesRes, sesionesRes] = await Promise.all([
      supabase
        .from("clases_en_vivo")
        .select("id,fecha,hora_inicio,hora_fin,titulo,duracion_min")
        .eq("profesor_id", uid)
        .lte("fecha", hoy)
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true }),
      supabase
        .from("sesiones_1a1")
        .select("id,fecha,hora_inicio,hora_fin,profesor_id,alumna_id,estado,motivo,duracion_min")
        .eq("profesor_id", uid)
        .lte("fecha", hoyEcuador)
        .order("fecha", { ascending: true })
        .order("hora_inicio", { ascending: true }),
    ]);

    const clases = ((clasesRes.data ?? []) as ClasePendiente[])
      .filter((c) => Number(c.duracion_min ?? 0) <= 0 && termino(c.fecha, c.hora_inicio, c.hora_fin))
      .map<Pendiente>((clase) => ({ tipo: "clase", clase }));

    const sesiones = ((sesionesRes.data ?? []) as SesionPendiente[])
      .filter((s) => {
        const estado = (s.estado || "confirmada").toLowerCase();
        return Number(s.duracion_min ?? 0) <= 0
          && !["cancelada", "cancelado", "anulada", "anulado", "finalizada", "no_realizada", "no realizado"].includes(estado)
          && sesion1a1Terminada(s.fecha, s.hora_inicio, s.hora_fin);
      })
      .map<Pendiente>((sesion) => ({ tipo: "1a1", sesion }));

    const todos = [...clases, ...sesiones].sort((a, b) => {
      const aa = a.tipo === "clase" ? a.clase : a.sesion;
      const bb = b.tipo === "clase" ? b.clase : b.sesion;
      return (aa.fecha + aa.hora_inicio).localeCompare(bb.fecha + bb.hora_inicio);
    });
    setPendientes(todos);

    const idsAlumnas = Array.from(new Set(
      sesiones.map((p) => p.sesion.alumna_id).filter(Boolean),
    ));
    if (idsAlumnas.length) {
      const perfiles = await fetchPerfiles(idsAlumnas);
      const map: Record<string, string> = {};
      perfiles.forEach((p) => { map[p.id] = formatNombre(p.nombre_completo) || p.email || "Estudiante"; });
      setAlumnas(map);
    }
    setLoading(false);
  }, [uid, isProfesor]);

  useEffect(() => {
    void cargar();
    if (!uid || !isProfesor) return;
    const refrescar = () => void cargar();
    window.addEventListener("adn:horas-actualizadas", refrescar);
    window.addEventListener("focus", refrescar);
    return () => {
      window.removeEventListener("adn:horas-actualizadas", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [uid, isProfesor, cargar]);

  const abrirNoRealizada = (sesion: SesionPendiente) => {
    setNoRealizada(sesion);
    setMotivoNoRealizada("");
    setDetalleNoRealizada("");
  };

  const cerrarNoRealizada = () => {
    if (guardandoNoRealizada) return;
    setNoRealizada(null);
    setMotivoNoRealizada("");
    setDetalleNoRealizada("");
  };

  const confirmarNoRealizada = async () => {
    if (!noRealizada || !uid || guardandoNoRealizada) return;
    if (!motivoNoRealizada) {
      toast.error("Selecciona la razón por la que no se realizó la sesión.");
      return;
    }

    const opcion = MOTIVOS_NO_REALIZADA.find((m) => m.value === motivoNoRealizada);
    if (!opcion) return;

    const detalle = detalleNoRealizada.trim();
    if (motivoNoRealizada === "otro" && detalle.length < 5) {
      toast.error("Escribe el motivo (mínimo 5 caracteres).");
      return;
    }

    const razonFinal = motivoNoRealizada === "otro"
      ? detalle
      : detalle
        ? `${opcion.label}. ${detalle}`
        : opcion.label;

    setGuardandoNoRealizada(true);
    const { error } = await supabase.rpc("cancelar_sesion_1a1", {
      _id: noRealizada.id,
      _razon: razonFinal,
    });

    if (error) {
      setGuardandoNoRealizada(false);
      toast.error(error.message || "No se pudo registrar la sesión como no realizada.");
      return;
    }

    // La cancelación existente deja el registro para informes. Además avisamos a la alumna.
    const profesorNombre = formatNombre(session?.user.user_metadata?.nombre_completo as string | undefined)
      || session?.user.email
      || "Tu profesor";
    const { error: notifError } = await supabase.rpc("notificar", {
      _actor: uid,
      _cuerpo: `La sesión 1 a 1 del ${fechaBonita(noRealizada.fecha)} a las ${noRealizada.hora_inicio.slice(0, 5)} fue marcada como no realizada. Motivo: ${razonFinal}. Profesor: ${profesorNombre}.`,
      _referencia: noRealizada.id,
      _tipo: "sesion_no_realizada",
      _titulo: "Sesión 1 a 1 no realizada",
      _url: "/agenda-1a1",
      _usuarios: [noRealizada.alumna_id],
    });

    setGuardandoNoRealizada(false);
    setNoRealizada(null);
    setMotivoNoRealizada("");
    setDetalleNoRealizada("");
    await cargar();
    window.dispatchEvent(new Event("adn:horas-actualizadas"));
    window.dispatchEvent(new Event("adn:sesion-reprogramada"));

    if (notifError) {
      toast.success("Sesión marcada como no realizada y registrada en informes. La notificación no pudo enviarse.");
    } else {
      toast.success("Sesión marcada como no realizada · motivo registrado y alumna notificada.");
    }
  };

  if (!isProfesor || !uid || loading || pendientes.length === 0) return null;

  return (
    <div className="px-4 md:px-6 pt-5">
      <div className="max-w-4xl mx-auto rounded-2xl border-2 border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-amber-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold">Pendientes de registrar</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Si la sesión sí se realizó, registra su duración. Si no se realizó, indícalo con el motivo para que quede constancia y no cuente como hora trabajada.
            </p>
          </div>
          <span className="ml-auto shrink-0 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold">
            {pendientes.length} {pendientes.length === 1 ? "pendiente" : "pendientes"}
          </span>
        </div>

        <div className="divide-y divide-amber-500/15">
          {pendientes.map((p) => {
            const row = p.tipo === "clase" ? p.clase : p.sesion;
            const titulo = p.tipo === "clase"
              ? p.clase.titulo
              : `Sesión 1 a 1 · ${alumnas[p.sesion.alumna_id] || "Estudiante"}`;
            return (
              <div key={`${p.tipo}:${row.id}`} className="p-4 flex items-center gap-3 flex-wrap bg-card/70">
                <div className="w-10 h-10 rounded-xl grid place-items-center bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  {p.tipo === "clase" ? <Calendar className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-[220px]">
                  <div className="font-semibold text-sm">{titulo}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {fechaBonita(row.fecha)} · {row.hora_inicio.slice(0, 5)}{row.hora_fin ? ` – ${row.hora_fin.slice(0, 5)}` : ""} · duración sin registrar
                  </div>
                  {p.tipo === "1a1" && p.sesion.motivo && (
                    <div className="text-xs mt-1 opacity-80">Motivo original de reserva: {p.sesion.motivo}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setModal(p)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-gradient text-white text-xs font-semibold"
                  >
                    <Clock3 className="w-4 h-4" /> Registrar duración
                  </button>
                  {p.tipo === "1a1" && (
                    <button
                      type="button"
                      onClick={() => abrirNoRealizada(p.sesion)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" /> No se realizó
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal && (() => {
        const row = modal.tipo === "clase" ? modal.clase : modal.sesion;
        return (
          <RegistrarDuracionModal
            tipo={modal.tipo === "clase" ? "clase" : undefined}
            sesionId={row.id}
            horaInicio={row.hora_inicio}
            duracionInicial={row.duracion_min ?? null}
            onClose={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              void cargar();
              window.dispatchEvent(new Event("adn:horas-actualizadas"));
            }}
          />
        );
      })()}

      {noRealizada && (
        <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={cerrarNoRealizada}>
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 text-white relative" style={{ background: "linear-gradient(135deg,#7f1d1d,#b91c1c)" }}>
              <button
                type="button"
                onClick={cerrarNoRealizada}
                disabled={guardandoNoRealizada}
                className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Sesión 1 a 1</div>
              <h3 className="text-xl font-bold mt-1">Marcar como no realizada</h3>
              <p className="text-sm opacity-90 mt-1 pr-8">
                La razón es obligatoria y quedará registrada para informes. Esta sesión no contará como hora trabajada.
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border p-3 text-sm">
                <div className="font-semibold">{alumnas[noRealizada.alumna_id] || "Estudiante"}</div>
                <div className="text-xs text-muted-foreground mt-1 capitalize">
                  {fechaBonita(noRealizada.fecha)} · {noRealizada.hora_inicio.slice(0, 5)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">¿Por qué no se realizó? *</label>
                <select
                  value={motivoNoRealizada}
                  onChange={(e) => setMotivoNoRealizada(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm"
                >
                  <option value="">Selecciona una razón…</option>
                  {MOTIVOS_NO_REALIZADA.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  {motivoNoRealizada === "otro" ? "Especifica el motivo *" : "Detalle adicional (opcional)"}
                </label>
                <textarea
                  value={detalleNoRealizada}
                  onChange={(e) => setDetalleNoRealizada(e.target.value.slice(0, 300))}
                  rows={3}
                  maxLength={300}
                  placeholder={motivoNoRealizada === "otro" ? "Ej. La alumna avisó que tuvo una emergencia familiar…" : "Puedes agregar más contexto…"}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm resize-y"
                />
                <div className="text-[10px] text-muted-foreground text-right mt-1">{detalleNoRealizada.length}/300</div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={cerrarNoRealizada}
                  disabled={guardandoNoRealizada}
                  className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarNoRealizada()}
                  disabled={guardandoNoRealizada || !motivoNoRealizada || (motivoNoRealizada === "otro" && detalleNoRealizada.trim().length < 5)}
                  className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {guardandoNoRealizada && <Loader2 className="w-4 h-4 animate-spin" />}
                  {guardandoNoRealizada ? "Guardando…" : "Confirmar no realizada"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
