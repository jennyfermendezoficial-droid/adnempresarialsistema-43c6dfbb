import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, ChevronUp, Clock3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchPerfiles } from "@/lib/perfiles";
import { formatNombre } from "@/lib/nombres";
import { toast } from "sonner";

function fechaLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

type TipoRegistro = "clase" | "1a1";
interface Alumna { id: string; nombre_completo: string; email?: string | null }
type RpcHistorico = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function RegistroHistoricoClaseProfesor() {
  const { session, role, roles } = useAuth();
  const uid = session?.user.id;
  const puedeRegistrarHistorico = role === "admin" || role === "soporte" || roles.includes("admin") || roles.includes("soporte");
  const hoy = fechaLocal();
  const mesActual = hoy.slice(0, 7);
  const [abierto, setAbierto] = useState(false);
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>("clase");
  const [fecha, setFecha] = useState(hoy);
  const [horaInicio, setHoraInicio] = useState("15:00");
  const [duracion, setDuracion] = useState("60");
  const [tema, setTema] = useState("");
  const [motivo, setMotivo] = useState("");
  const [alumnas, setAlumnas] = useState<Alumna[]>([]);
  const [alumnaId, setAlumnaId] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!uid || !puedeRegistrarHistorico) return;
    void (async () => {
      const [perfiles, rolesRes] = await Promise.all([
        fetchPerfiles().catch(() => []),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const staffIds = new Set(
        ((rolesRes.data ?? []) as { user_id: string; role: string }[])
          .filter((r) => r.role === "admin" || r.role === "soporte")
          .map((r) => r.user_id),
      );
      const lista = ((perfiles ?? []) as Alumna[])
        .filter((p) => p.id !== uid && !staffIds.has(p.id))
        .sort((a, b) => (formatNombre(a.nombre_completo) || a.email || "").localeCompare(formatNombre(b.nombre_completo) || b.email || ""));
      setAlumnas(lista);
      setAlumnaId((actual) => actual && lista.some((a) => a.id === actual) ? actual : (lista[0]?.id ?? ""));
    })();
  }, [uid, puedeRegistrarHistorico]);

  const horaFin = useMemo(() => {
    const min = Number(duracion);
    if (!horaInicio || !Number.isFinite(min) || min <= 0) return "";
    return sumarMinutos(horaInicio, min);
  }, [horaInicio, duracion]);

  if (!uid || !puedeRegistrarHistorico) return null;

  const resetear = () => {
    setTipoRegistro("clase");
    setTema("");
    setMotivo("");
    setDuracion("60");
    setFecha(hoy);
    setHoraInicio("15:00");
  };

  const guardarClase = async (minutos: number) => {
    const titulo = tema.trim();
    if (minutos > 480) {
      toast.error("La duración de una clase debe estar entre 1 y 480 minutos.");
      return false;
    }
    if (titulo.length < 3) {
      toast.error("Escribe el tema de la clase.");
      return false;
    }

    const { data: existe, error: revisarError } = await supabase
      .from("clases_en_vivo")
      .select("id,titulo,duracion_min")
      .eq("profesor_id", uid)
      .eq("fecha", fecha)
      .eq("hora_inicio", `${horaInicio}:00`)
      .limit(1);
    if (revisarError) throw revisarError;
    if ((existe?.length ?? 0) > 0) {
      toast.error("Ya existe una clase tuya en esa fecha y hora. Completa ese registro en lugar de crear otro.");
      return false;
    }

    const { error } = await supabase.from("clases_en_vivo").insert({
      fecha,
      hora_inicio: `${horaInicio}:00`,
      hora_fin: `${horaFin}:00`,
      titulo,
      descripcion: "Registro histórico manual realizado por el profesor.",
      profesor_id: uid,
      created_by: uid,
      duracion_min: minutos,
      recordatorio_enviado: true,
    });
    if (error) throw error;

    toast.success("Clase histórica registrada. Ya cuenta en las horas e informes del mes.");
    return true;
  };

  const guardarSesion1a1 = async (minutos: number) => {
    if (!alumnaId) {
      toast.error("Selecciona la alumna de la sesión.");
      return false;
    }
    if (minutos > 60) {
      toast.error("Las sesiones 1 a 1 permiten un máximo de 60 minutos.");
      return false;
    }

    const rpcClient = supabase as unknown as { rpc: RpcHistorico };
    const { error } = await rpcClient.rpc("registrar_sesion_1a1_historica", {
      _alumna_id: alumnaId,
      _fecha: fecha,
      _hora_inicio: `${horaInicio}:00`,
      _duracion_min: minutos,
      _motivo: motivo.trim() || null,
    });
    if (error) throw new Error(error.message);

    toast.success("Sesión 1 a 1 histórica registrada. Ya cuenta en horas, informes y pagos.");
    return true;
  };

  const guardar = async () => {
    const minutos = Number(duracion);
    if (!fecha || !fecha.startsWith(mesActual) || fecha > hoy) {
      toast.error("Solo puedes registrar actividades que ya ocurrieron durante el mes actual.");
      return;
    }
    if (!horaInicio) return toast.error("Indica la hora de inicio.");
    if (!Number.isFinite(minutos) || minutos < 1) {
      toast.error("La duración debe ser de al menos 1 minuto.");
      return;
    }

    setGuardando(true);
    try {
      const ok = tipoRegistro === "clase"
        ? await guardarClase(minutos)
        : await guardarSesion1a1(minutos);
      if (!ok) return;

      resetear();
      setAbierto(false);
      window.dispatchEvent(new Event("adn:horas-actualizadas"));
      window.dispatchEvent(new Event("adn:clase-historica-registrada"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar la actividad histórica");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="px-4 md:px-6 pt-5">
      <div className="max-w-4xl mx-auto rounded-2xl border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="w-full p-4 flex items-center gap-3 text-left hover:bg-muted/30 transition"
        >
          <div className="w-10 h-10 rounded-xl bg-violet/10 grid place-items-center shrink-0">
            <CalendarPlus className="w-5 h-5 text-violet" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Registrar clase o sesión histórica del mes</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Para clases en vivo o sesiones 1 a 1 que ya realizaste este mes y no quedaron registradas en el sistema.
            </div>
          </div>
          {abierto ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {abierto && (
          <div className="border-t p-4 grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo de registro *</label>
              <div className="mt-1 flex gap-1 p-1 rounded-lg border bg-background w-fit">
                <button
                  type="button"
                  onClick={() => { setTipoRegistro("clase"); setDuracion("60"); }}
                  className={`px-3 py-2 rounded-md text-sm font-semibold ${tipoRegistro === "clase" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}
                >
                  Clase en vivo
                </button>
                <button
                  type="button"
                  onClick={() => { setTipoRegistro("1a1"); setDuracion("60"); }}
                  className={`px-3 py-2 rounded-md text-sm font-semibold ${tipoRegistro === "1a1" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}
                >
                  Sesión 1 a 1
                </button>
              </div>
            </div>

            {tipoRegistro === "1a1" && (
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alumna *</label>
                <select
                  value={alumnaId}
                  onChange={(e) => setAlumnaId(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
                >
                  <option value="">Selecciona una alumna…</option>
                  {alumnas.map((a) => (
                    <option key={a.id} value={a.id}>{formatNombre(a.nombre_completo) || a.email || "Alumna"}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fecha *</label>
              <input
                type="date"
                value={fecha}
                min={`${mesActual}-01`}
                max={hoy}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hora de inicio *</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duración real (minutos) *</label>
              <input
                type="number"
                min="1"
                max={tipoRegistro === "1a1" ? "60" : "480"}
                step="1"
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
              />
              {horaFin && (
                <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                  <Clock3 className="w-3.5 h-3.5" /> Termina aproximadamente a las {horaFin}
                </div>
              )}
            </div>

            {tipoRegistro === "clase" ? (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tema de la clase *</label>
                <input
                  type="text"
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  placeholder="Ej. Meta Ads · Campañas de conversión"
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motivo / nota <span className="normal-case font-normal">(opcional)</span></label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
                  placeholder="Ej. Revisión de landing page"
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
                />
              </div>
            )}

            <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando}
                className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                {tipoRegistro === "clase" ? "Registrar clase y horas" : "Registrar sesión 1 a 1"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
