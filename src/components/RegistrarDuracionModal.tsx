import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock } from "lucide-react";

interface Props {
  sesionId: string;
  /** "1a1" (por defecto) o "clase" para clases en vivo */
  tipo?: "1a1" | "clase";
  horaInicio: string; // "HH:MM" o "HH:MM:SS"
  duracionInicial?: number | null;
  onClose: () => void;
  onSaved: (duracionMin: number, horaFin: string, horaInicio: string) => void;
}

const HHMM = /^(\d{1,2}):(\d{2})$/;
const MAX_CLASE_MIN = 600;
const MAX_SESION_1A1_MIN = 60;

function toMin(hhmm: string): number | null {
  const match = HHMM.exec((hhmm ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}
function toHHMM(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function fmt(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function RegistrarDuracionModal({ sesionId, tipo = "1a1", horaInicio, duracionInicial, onClose, onSaved }: Props) {
  const inicioBase = (horaInicio ?? "").slice(0, 5);
  const inicial = duracionInicial && duracionInicial > 0
    ? (tipo === "1a1" ? Math.min(duracionInicial, MAX_SESION_1A1_MIN) : duracionInicial)
    : 60;
  const [inicio, setInicio] = useState(inicioBase);
  const [fin, setFin] = useState(() => {
    const base = toMin(inicioBase);
    return base === null ? "" : toHHMM(base + inicial);
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const minInicio = toMin(inicio);
  const minFin = toMin(fin);
  const duracionReal = minInicio !== null && minFin !== null ? minFin - minInicio : 0;
  const valido = minInicio !== null && minFin !== null && duracionReal > 0 && duracionReal <= MAX_CLASE_MIN;
  const duracionGuardar = tipo === "1a1" ? Math.min(duracionReal, MAX_SESION_1A1_MIN) : duracionReal;
  const excedeLimite1a1 = tipo === "1a1" && duracionReal > MAX_SESION_1A1_MIN;
  const finGuardar = minInicio === null ? fin : toHHMM(minInicio + Math.max(0, duracionGuardar));

  const guardar = async () => {
    if (!valido) {
      toast.error("La hora de fin debe ser posterior a la de inicio (máx. 10 horas para clases).");
      return;
    }
    setSaving(true);
    const args = { _duracion_min: duracionGuardar, _hora_inicio: `${inicio}:00` };
    const { error } =
      tipo === "clase"
        ? await supabase.rpc("registrar_duracion_clase", { _clase_id: sesionId, ...args })
        : await supabase.rpc("registrar_duracion_sesion", { _sesion_id: sesionId, ...args });
    setSaving(false);
    if (error) return toast.error(error.message);

    if (excedeLimite1a1) {
      toast.success("Sesión registrada con el máximo permitido de 60 minutos.");
    } else {
      toast.success("Duración registrada.");
    }
    onSaved(duracionGuardar, finGuardar, inicio);
    window.dispatchEvent(new Event("adn:horas-actualizadas"));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card p-6 rounded-2xl max-w-md w-full" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2"><Clock className="w-4 h-4" /> Registrar duración</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Indica a qué hora empezó y a qué hora terminó {tipo === "clase" ? "la clase" : "la reunión"}. Solo el profesor que la dio puede registrarla.
        </p>

        {tipo === "1a1" && (
          <div className="mb-4 rounded-xl border border-violet/25 bg-violet/5 px-3 py-2 text-xs text-muted-foreground">
            Las sesiones 1 a 1 tienen un máximo registrable y pagable de <strong className="text-foreground">60 minutos</strong>. Si indicas más tiempo, el sistema guardará únicamente 1 hora.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Hora de inicio</label>
            <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Hora de fin</label>
            <input type="time" value={fin} onChange={(e) => setFin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {valido ? (
            excedeLimite1a1 ? (
              <div className="space-y-1">
                <div>Tiempo indicado: <span className="font-semibold text-foreground">{inicio} – {fin}</span> · {fmt(duracionReal)}</div>
                <div className="font-semibold text-amber-700 dark:text-amber-300">Se registrará: {inicio} – {finGuardar} · 1 h máximo.</div>
              </div>
            ) : (
              <>Resultado: <span className="font-semibold text-foreground">{inicio} – {fin}</span> · {fmt(duracionGuardar)}</>
            )
          ) : (
            <span className="text-destructive">La hora de fin debe ser posterior a la de inicio (máx. 10 horas para clases).</span>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button disabled={saving} onClick={onClose} className="px-4 py-2 rounded-lg border">Cancelar</button>
          <button disabled={saving || !valido} onClick={guardar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-60">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
