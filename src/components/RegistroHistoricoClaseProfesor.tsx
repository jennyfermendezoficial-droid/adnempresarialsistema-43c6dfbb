import { useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, ChevronUp, Clock3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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

export function RegistroHistoricoClaseProfesor() {
  const { session, role, roles } = useAuth();
  const uid = session?.user.id;
  const esProfesor = role === "soporte" || roles.includes("soporte");
  const hoy = fechaLocal();
  const mesActual = hoy.slice(0, 7);
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [horaInicio, setHoraInicio] = useState("15:00");
  const [duracion, setDuracion] = useState("60");
  const [tema, setTema] = useState("");
  const [guardando, setGuardando] = useState(false);

  const horaFin = useMemo(() => {
    const min = Number(duracion);
    if (!horaInicio || !Number.isFinite(min) || min <= 0) return "";
    return sumarMinutos(horaInicio, min);
  }, [horaInicio, duracion]);

  if (!uid || !esProfesor) return null;

  const guardar = async () => {
    const minutos = Number(duracion);
    const titulo = tema.trim();
    if (!fecha || !fecha.startsWith(mesActual) || fecha > hoy) {
      toast.error("Solo puedes registrar clases que ya ocurrieron durante el mes actual.");
      return;
    }
    if (!horaInicio) return toast.error("Indica la hora de inicio.");
    if (!Number.isFinite(minutos) || minutos < 1 || minutos > 480) {
      toast.error("La duración debe estar entre 1 y 480 minutos.");
      return;
    }
    if (titulo.length < 3) return toast.error("Escribe el tema de la clase.");

    setGuardando(true);
    try {
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
        return;
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
      setTema("");
      setDuracion("60");
      setFecha(hoy);
      setAbierto(false);
      window.dispatchEvent(new Event("adn:horas-actualizadas"));
      window.dispatchEvent(new Event("adn:clase-historica-registrada"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar la clase histórica");
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
            <div className="font-semibold">Registrar clase histórica del mes</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Para clases que ya diste mientras el sistema todavía estaba en creación. Fecha, duración y tema son obligatorios.
            </div>
          </div>
          {abierto ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {abierto && (
          <div className="border-t p-4 grid md:grid-cols-2 gap-4">
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
                max="480"
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
            <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando}
                className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar clase y horas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
