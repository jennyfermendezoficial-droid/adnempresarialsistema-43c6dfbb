import { useState } from "react";
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

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
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
  const inicioBase = horaInicio.slice(0, 5);
  const inicial = duracionInicial && duracionInicial > 0 ? duracionInicial : 60;
  const [inicio, setInicio] = useState(inicioBase);
  const [fin, setFin] = useState(toHHMM(toMin(inicioBase) + inicial));
  const [saving, setSaving] = useState(false);

  const duracion = toMin(fin) - toMin(inicio);
  const valido = /^\d{2}:\d{2}$/.test(inicio) && /^\d{2}:\d{2}$/.test(fin) && duracion > 0 && duracion <= 600;

  const guardar = async () => {
    if (!valido) {
      toast.error("La hora de fin debe ser posterior a la de inicio (máx. 10 horas).");
      return;
    }
    setSaving(true);
    const args = { _duracion_min: duracion, _hora_inicio: `${inicio}:00` };
    const { error } =
      tipo === "clase"
        ? await supabase.rpc("registrar_duracion_clase", { _clase_id: sesionId, ...args })
        : await supabase.rpc("registrar_duracion_sesion", { _sesion_id: sesionId, ...args });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Duración registrada.");
    onSaved(duracion, fin, inicio);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card p-6 rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2"><Clock className="w-4 h-4" /> Registrar duración</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Indica a qué hora empezó y a qué hora terminó {tipo === "clase" ? "la clase" : "la reunión"}. Solo el profesor que la dio puede registrarla.
        </p>

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
            <>Resultado: <span className="font-semibold text-foreground">{inicio} – {fin}</span> · {fmt(duracion)}</>
          ) : (
            <span className="text-destructive">La hora de fin debe ser posterior a la de inicio (máx. 10 horas).</span>
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
