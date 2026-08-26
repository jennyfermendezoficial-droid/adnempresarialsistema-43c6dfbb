import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, Clock3, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { RegistrarDuracionModal } from "@/components/RegistrarDuracionModal";
import { fetchPerfiles } from "@/lib/perfiles";
import { formatNombre } from "@/lib/nombres";

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
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!uid || !isProfesor) {
      setPendientes([]);
      setLoading(false);
      return;
    }

    const hoy = fechaLocal();
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
        .lte("fecha", hoy)
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
          && !["cancelada", "cancelado", "anulada", "anulado", "finalizada"].includes(estado)
          && termino(s.fecha, s.hora_inicio, s.hora_fin);
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

  if (!isProfesor || !uid || loading || pendientes.length === 0) return null;

  return (
    <div className="px-4 md:px-6 pt-5">
      <div className="max-w-4xl mx-auto rounded-2xl border-2 border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-amber-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold">Pendientes de registrar</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Estas son exactamente las clases y sesiones que ya terminaron y todavía no tienen duración real. Regístralas aquí para quitarlas de la alerta.
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
                    <div className="text-xs mt-1 opacity-80">Motivo: {p.sesion.motivo}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setModal(p)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-gradient text-white text-xs font-semibold"
                >
                  <Clock3 className="w-4 h-4" /> Registrar duración
                </button>
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
    </div>
  );
}
