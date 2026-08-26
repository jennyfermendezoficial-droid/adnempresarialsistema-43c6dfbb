import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock, Clock3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createZoomMeeting } from "@/lib/zoom.functions";
import { fetchPerfiles } from "@/lib/perfiles";
import { formatNombre } from "@/lib/nombres";
import { toast } from "sonner";

export interface SesionPendienteAlumnoRow {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  profesor_id: string;
  alumna_id: string;
  estado: string | null;
  duracion_min: number | null;
  motivo: string | null;
  zoom_link: string | null;
}

const HORAS = ["15:00", "16:00", "17:00", "18:00"];
const ZOOM_DURACION_MIN = 60;

function fechaLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

function sesionYaTermino(s: SesionPendienteAlumnoRow) {
  const ahora = new Date();
  const inicio = new Date(`${s.fecha}T${s.hora_inicio.slice(0, 5)}:00`);
  const fin = s.hora_fin
    ? new Date(`${s.fecha}T${s.hora_fin.slice(0, 5)}:00`)
    : new Date(inicio.getTime() + ZOOM_DURACION_MIN * 60_000);
  return fin.getTime() <= ahora.getTime();
}

function esPendiente(s: SesionPendienteAlumnoRow) {
  const estado = (s.estado || "confirmada").toLowerCase();
  return Number(s.duracion_min ?? 0) <= 0
    && !["cancelada", "cancelado", "anulada", "anulado", "finalizada"].includes(estado)
    && sesionYaTermino(s);
}

export function useSesionesPendientesAlumno(uid?: string, habilitado = true) {
  const [pendientes, setPendientes] = useState<SesionPendienteAlumnoRow[]>([]);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    if (!uid || !habilitado) {
      setPendientes([]);
      return;
    }
    setLoading(true);
    const hoy = fechaLocal();
    const { data, error } = await supabase
      .from("sesiones_1a1")
      .select("id,fecha,hora_inicio,hora_fin,profesor_id,alumna_id,estado,duracion_min,motivo,zoom_link")
      .eq("alumna_id", uid)
      .lte("fecha", hoy)
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(`No se pudieron revisar tus sesiones pendientes: ${error.message}`);
      return;
    }
    const rows = ((data ?? []) as SesionPendienteAlumnoRow[]).filter(esPendiente);
    setPendientes(rows);

    // Notificación única por sesión para la alumna. Si la consulta falla, no bloqueamos el flujo.
    for (const s of rows) {
      const { data: existente } = await supabase
        .from("notificaciones")
        .select("id")
        .eq("usuario_id", uid)
        .eq("tipo", "sesion_pendiente_reprogramar")
        .eq("referencia_id", s.id)
        .limit(1);
      if ((existente?.length ?? 0) === 0) {
        await supabase.rpc("notificar", {
          _actor: uid,
          _cuerpo: `Tu sesión del ${s.fecha} sigue pendiente. Si no alcanzaste a tenerla, reprograma esta misma sesión únicamente para el día siguiente. Mientras siga pendiente no podrás reservar una nueva.`,
          _referencia: s.id,
          _tipo: "sesion_pendiente_reprogramar",
          _titulo: "Tienes una sesión pendiente por resolver",
          _url: "/agenda-1a1",
          _usuarios: [uid],
        });
      }
    }
  }, [uid, habilitado]);

  useEffect(() => {
    void cargar();
    if (!uid || !habilitado) return;
    const refrescar = () => void cargar();
    window.addEventListener("focus", refrescar);
    window.addEventListener("adn:sesion-reprogramada", refrescar);
    window.addEventListener("adn:horas-actualizadas", refrescar);
    const timer = window.setInterval(refrescar, 60_000);
    return () => {
      window.removeEventListener("focus", refrescar);
      window.removeEventListener("adn:sesion-reprogramada", refrescar);
      window.removeEventListener("adn:horas-actualizadas", refrescar);
      window.clearInterval(timer);
    };
  }, [uid, habilitado, cargar]);

  return { pendientes, loading, recargar: cargar };
}

export function SesionPendienteAlumnoPanel({
  pendientes,
  onReprogramada,
}: {
  pendientes: SesionPendienteAlumnoRow[];
  onReprogramada: () => void | Promise<void>;
}) {
  const createZoom = useServerFn(createZoomMeeting);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [seleccion, setSeleccion] = useState<SesionPendienteAlumnoRow | null>(null);
  const [horasDisponibles, setHorasDisponibles] = useState<string[]>([]);
  const [horaNueva, setHoraNueva] = useState("");
  const [cargandoHoras, setCargandoHoras] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const ids = Array.from(new Set(pendientes.map((s) => s.profesor_id)));
    if (!ids.length) return;
    void (async () => {
      const perfiles = await fetchPerfiles(ids);
      const map: Record<string, string> = {};
      perfiles.forEach((p) => {
        map[p.id] = formatNombre(p.nombre_completo) || p.email || "Profesor";
      });
      setNombres(map);
    })();
  }, [pendientes]);

  const hoy = fechaLocal();
  const principal = pendientes[0];
  const fechaDestinoPrincipal = principal ? sumarDias(principal.fecha, 1) : "";
  const puedeReprogramarPrincipal = Boolean(principal && fechaDestinoPrincipal >= hoy);

  const abrirReprogramacion = async (sesion: SesionPendienteAlumnoRow) => {
    const destino = sumarDias(sesion.fecha, 1);
    if (destino < hoy) {
      toast.error("Esta sesión ya pasó del único día permitido para reprogramarla. El profesor debe registrarla o el equipo debe resolverla.");
      return;
    }

    setSeleccion(sesion);
    setHoraNueva("");
    setCargandoHoras(true);

    const dia = new Date(`${destino}T12:00:00`);
    const indiceSemana = (dia.getDay() + 6) % 7; // lunes=0
    if (indiceSemana > 4) {
      setHorasDisponibles([]);
      setCargandoHoras(false);
      return;
    }

    const [{ data: ocupadas }, { data: disp }] = await Promise.all([
      supabase
        .from("sesiones_1a1")
        .select("hora_inicio")
        .eq("profesor_id", sesion.profesor_id)
        .eq("fecha", destino)
        .neq("id", sesion.id),
      supabase
        .from("disponibilidad")
        .select("activo")
        .eq("profesor_id", sesion.profesor_id)
        .eq("dia_semana", indiceSemana)
        .maybeSingle(),
    ]);

    if (disp && disp.activo === false) {
      setHorasDisponibles([]);
      setCargandoHoras(false);
      return;
    }

    const tomadas = new Set(((ocupadas ?? []) as { hora_inicio: string }[]).map((x) => x.hora_inicio.slice(0, 5)));
    const ahora = new Date();
    const horas = HORAS.filter((h) => {
      if (tomadas.has(h)) return false;
      if (destino !== hoy) return true;
      return new Date(`${destino}T${h}:00`).getTime() > ahora.getTime();
    });
    setHorasDisponibles(horas);
    setHoraNueva(horas[0] ?? "");
    setCargandoHoras(false);
  };

  const guardarReprogramacion = async () => {
    if (!seleccion || !horaNueva || guardando) return;
    const destino = sumarDias(seleccion.fecha, 1);
    const nombreProfesor = nombres[seleccion.profesor_id] || "Profesor";
    setGuardando(true);

    try {
      // Confirmar otra vez que el horario siga libre antes de mover la misma sesión.
      const { data: choque } = await supabase
        .from("sesiones_1a1")
        .select("id")
        .eq("profesor_id", seleccion.profesor_id)
        .eq("fecha", destino)
        .eq("hora_inicio", `${horaNueva}:00`)
        .neq("id", seleccion.id)
        .limit(1);
      if ((choque?.length ?? 0) > 0) throw new Error("Ese horario acaba de ser reservado. Elige otro.");

      const zoom = await createZoom({
        data: {
          topic: `Sesión 1 a 1 reprogramada · ${nombreProfesor}`,
          start_time: `${destino}T${horaNueva}:00`,
          duration: ZOOM_DURACION_MIN,
          agenda: `Sesión 1 a 1 reprogramada para ${destino} a las ${horaNueva}`,
        },
      });

      const { error } = await supabase
        .from("sesiones_1a1")
        .update({
          fecha: destino,
          hora_inicio: `${horaNueva}:00`,
          hora_fin: null,
          estado: "confirmada",
          zoom_meeting_id: zoom.meeting_id,
          zoom_link: zoom.join_url,
        })
        .eq("id", seleccion.id)
        .eq("alumna_id", seleccion.alumna_id);
      if (error) throw error;

      await supabase.rpc("notificar", {
        _actor: seleccion.alumna_id,
        _cuerpo: `La sesión fue reprogramada del ${seleccion.fecha} al ${destino} a las ${horaNueva}. Se mantiene la misma reserva y se generó un nuevo enlace de Zoom.`,
        _referencia: seleccion.id,
        _tipo: "sesion_reprogramada",
        _titulo: "Sesión 1 a 1 reprogramada",
        _url: "/agenda-1a1",
        _usuarios: [seleccion.alumna_id, seleccion.profesor_id],
      });

      toast.success(`Sesión movida al ${destino} a las ${horaNueva}.`);
      setSeleccion(null);
      window.dispatchEvent(new Event("adn:sesion-reprogramada"));
      await onReprogramada();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reprogramar la sesión");
    } finally {
      setGuardando(false);
    }
  };

  const detallePrincipal = useMemo(() => {
    if (!principal) return "";
    const prof = nombres[principal.profesor_id] || "tu profesor";
    return `${principal.fecha} · ${principal.hora_inicio.slice(0, 5)} · ${prof}`;
  }, [principal, nombres]);

  if (!principal) return null;

  return (
    <>
      <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Sesión pendiente por resolver</div>
            <p className="text-sm text-muted-foreground mt-1">
              Tienes {pendientes.length === 1 ? "una sesión anterior" : `${pendientes.length} sesiones anteriores`} sin duración registrada. Mientras exista esta pendiente no puedes reservar una nueva sesión 1 a 1.
            </p>
            <div className="mt-2 text-sm font-medium">{detallePrincipal}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Si no alcanzaste a tener tu sesión, puedes mover esta misma reserva únicamente al día siguiente. No se crea una sesión nueva.
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              {puedeReprogramarPrincipal ? (
                <button
                  type="button"
                  onClick={() => void abrirReprogramacion(principal)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold"
                >
                  <CalendarClock className="w-4 h-4" /> Reprogramar esta sesión
                </button>
              ) : (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Ya pasó el único día permitido para reprogramarla. El profesor debe registrar la sesión o el equipo debe resolverla.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {seleccion && (
        <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => !guardando && setSeleccion(null)}>
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-violet" />
              <h3 className="text-lg font-semibold">Reprogramar al día siguiente</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              La sesión del <strong>{seleccion.fecha}</strong> solo puede moverse al <strong>{sumarDias(seleccion.fecha, 1)}</strong>.
            </p>

            <div className="mt-4">
              <div className="text-xs font-semibold mb-2">Horario disponible</div>
              {cargandoHoras ? (
                <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Revisando horarios…</div>
              ) : horasDisponibles.length === 0 ? (
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">El Profesor no tiene un horario disponible ese día. No se puede mover a otra fecha distinta.</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {horasDisponibles.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHoraNueva(h)}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-semibold inline-flex items-center justify-center gap-1 ${horaNueva === h ? "bg-violet-gradient text-white border-transparent" : ""}`}
                    >
                      <Clock3 className="w-4 h-4" /> {h}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button disabled={guardando} onClick={() => setSeleccion(null)} className="px-3 py-2 rounded-lg border text-sm">Cancelar</button>
              <button
                disabled={!horaNueva || guardando}
                onClick={() => void guardarReprogramacion()}
                className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                {guardando ? "Reprogramando…" : "Confirmar reprogramación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
