import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fechaHoyEcuador, sesion1a1Terminada, slot1a1Pasado } from "@/lib/sesion-1a1-tiempo";
import { fetchPerfiles } from "@/lib/perfiles";
import { formatNombre } from "@/lib/nombres";
import {
  CancelarSesion1a1ProfesorModal,
  type SesionCancelableProfesor,
} from "@/components/CancelarSesion1a1ProfesorModal";

interface Sesion1a1 {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  profesor_id: string;
  alumna_id: string;
  estado: string;
  duracion_min: number | null;
  finalizada_at: string | null;
}

interface Persona {
  id: string;
  nombre_completo: string;
  email?: string | null;
}

const ESTADOS_RESUELTOS = new Set([
  "cancelada",
  "cancelado",
  "anulada",
  "anulado",
  "no_realizada",
  "no realizado",
]);

export function Agenda1a1FinalizacionProfesor() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const puedeResolver = role === "soporte" || role === "admin";
  const [sesiones, setSesiones] = useState<Sesion1a1[]>([]);
  const [personas, setPersonas] = useState<Record<string, Persona>>({});
  const [now, setNow] = useState(new Date());
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<Sesion1a1 | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uid || !puedeResolver) {
      setSesiones([]);
      return;
    }

    let activo = true;
    const cargar = async () => {
      const hoy = fechaHoyEcuador();
      const { data, error } = await supabase
        .from("sesiones_1a1")
        .select("id,fecha,hora_inicio,hora_fin,profesor_id,alumna_id,estado,duracion_min,finalizada_at")
        .eq("profesor_id", uid)
        .eq("fecha", hoy)
        .order("hora_inicio");

      if (!activo) return;
      if (error) {
        console.error("[Agenda1a1FinalizacionProfesor]", error);
        return;
      }

      const rows = ((data ?? []) as Sesion1a1[]).filter(
        (s) => !ESTADOS_RESUELTOS.has((s.estado || "confirmada").toLowerCase()),
      );
      setSesiones(rows);

      const ids = Array.from(new Set(rows.map((s) => s.alumna_id).filter(Boolean)));
      if (!ids.length) {
        setPersonas({});
        return;
      }
      const perfiles = await fetchPerfiles(ids);
      if (!activo) return;
      const mapa: Record<string, Persona> = {};
      (perfiles as Persona[]).forEach((p) => { mapa[p.id] = p; });
      setPersonas(mapa);
    };

    void cargar();
    const refrescar = () => void cargar();
    window.addEventListener("focus", refrescar);
    return () => {
      activo = false;
      window.removeEventListener("focus", refrescar);
    };
  }, [uid, puedeResolver]);

  const enCurso = useMemo(
    () => sesiones.filter((s) => {
      if (Number(s.duracion_min || 0) > 0 || s.finalizada_at) return false;
      if (!slot1a1Pasado(s.fecha, s.hora_inicio, now)) return false;
      return !sesion1a1Terminada(s.fecha, s.hora_inicio, s.hora_fin, now);
    }),
    [sesiones, now],
  );

  if (!uid || !puedeResolver || enCurso.length === 0) return null;

  const nombreAlumna = (id: string) => {
    const p = personas[id];
    return formatNombre(p?.nombre_completo) || p?.email || "Alumna";
  };

  const finalizar = async (sesion: Sesion1a1) => {
    if (finalizandoId) return;
    if (!window.confirm("¿Marcar esta reunión como finalizada? Después podrás registrar la duración real.")) return;

    setFinalizandoId(sesion.id);
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message?: string } | null }>;
    const { error } = await rpc("finalizar_sesion_1a1", { _sesion_id: sesion.id });
    setFinalizandoId(null);

    if (error) return toast.error(error.message || "No se pudo finalizar la reunión.");

    toast.success("Reunión finalizada. Ya puedes registrar la duración.");
    window.dispatchEvent(new Event("adn:horas-actualizadas"));
    window.location.reload();
  };

  return (
    <div className="p-4 md:px-6 md:pt-6 md:pb-0 max-w-7xl mx-auto">
      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5" style={{ color: "var(--violet)" }} />
            <h2 className="text-lg font-semibold">Sesión 1 a 1 en curso</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cuando termine la reunión, márcala como finalizada para habilitar de inmediato el registro de duración.
          </p>
        </div>

        <div className="divide-y">
          {enCurso.map((s) => (
            <div key={s.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{nombreAlumna(s.alumna_id)}</div>
                <div className="text-xs text-muted-foreground">
                  Hoy · {s.hora_inicio.slice(0, 5)} · reunión en curso
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void finalizar(s)}
                  disabled={finalizandoId === s.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-gradient text-white text-xs font-semibold disabled:opacity-60"
                >
                  {finalizandoId === s.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {finalizandoId === s.id ? "Finalizando…" : "Finalizar reunión"}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelar(s)}
                  disabled={!!finalizandoId}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-red-600 text-xs font-semibold disabled:opacity-60"
                >
                  <Ban className="w-3.5 h-3.5" /> No se realizó
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {cancelar && (
        <CancelarSesion1a1ProfesorModal
          sesion={cancelar as SesionCancelableProfesor}
          alumnaNombre={nombreAlumna(cancelar.alumna_id)}
          onClose={() => setCancelar(null)}
          onResolved={() => { window.location.reload(); }}
        />
      )}
    </div>
  );
}
