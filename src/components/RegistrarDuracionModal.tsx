import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock } from "lucide-react";

interface Props {
  sesionId: string;
  horaInicio: string; // "HH:MM" o "HH:MM:SS"
  onClose: () => void;
  onSaved: (duracionMin: number, horaFin: string) => void;
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function RegistrarDuracionModal({ sesionId, horaInicio, onClose, onSaved }: Props) {
  const inicio = horaInicio.slice(0, 5);
  const [modo, setModo] = useState<"minutos" | "fin">("minutos");
  const [minutos, setMinutos] = useState("60");
  const [horaFin, setHoraFin] = useState(toHHMM(toMin(inicio) + 60));
  const [saving, setSaving] = useState(false);

  const cambiarMinutos = (v: string) => {
    setMinutos(v);
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) setHoraFin(toHHMM(toMin(inicio) + n));
  };
  const cambiarHoraFin = (v: string) => {
    setHoraFin(v);
    if (/^\d{2}:\d{2}$/.test(v)) {
      const diff = toMin(v) - toMin(inicio);
      if (diff > 0) setMinutos(String(diff));
    }
  };

  const duracion = Number(minutos);

  const guardar = async () => {
    if (!Number.isFinite(duracion) || duracion <= 0 || duracion > 600) {
      toast.error("Ingresa una duración válida (1 a 600 minutos).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("registrar_duracion_sesion", {
      _sesion_id: sesionId,
      _duracion_min: Math.round(duracion),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Duración registrada.");
    onSaved(Math.round(duracion), toHHMM(toMin(inicio) + Math.round(duracion)));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card p-6 rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2"><Clock className="w-4 h-4" /> Registrar duración</h3>
        <p className="text-xs text-muted-foreground mb-4">La reunión comenzó a las <span className="font-semibold text-foreground">{inicio}</span>.</p>

        <div className="flex gap-1 p-1 rounded-xl bg-muted mb-4">
          {(["minutos", "fin"] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition"
              style={modo === m ? { background: "var(--card)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" } : { opacity: 0.65 }}>
              {m === "minutos" ? "Cuánto duró" : "A qué hora terminó"}
            </button>
          ))}
        </div>

        {modo === "minutos" ? (
          <>
            <label className="block text-xs font-medium mb-1">Duración en minutos</label>
            <input type="number" min={1} max={600} value={minutos} onChange={(e) => cambiarMinutos(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          </>
        ) : (
          <>
            <label className="block text-xs font-medium mb-1">Hora en que terminó</label>
            <input type="time" value={horaFin} onChange={(e) => cambiarHoraFin(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          </>
        )}

        <div className="mt-3 text-xs text-muted-foreground">
          Resultado: <span className="font-semibold text-foreground">{inicio} – {horaFin}</span>
          {Number.isFinite(duracion) && duracion > 0 && <> · {Math.round(duracion)} min</>}
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button disabled={saving} onClick={onClose} className="px-4 py-2 rounded-lg border">Cancelar</button>
          <button disabled={saving} onClick={guardar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-60">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}