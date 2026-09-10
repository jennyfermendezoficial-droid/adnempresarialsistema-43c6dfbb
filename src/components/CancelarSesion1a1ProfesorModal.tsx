import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatNombre } from "@/lib/nombres";

export interface SesionCancelableProfesor {
  id: string;
  fecha: string;
  hora_inicio: string;
  profesor_id: string;
  alumna_id: string;
}

const MOTIVOS = [
  { value: "agendada_error", label: "La sesión se agendó por error" },
  { value: "alumna_no_puede", label: "La alumna avisó que no podrá asistir" },
  { value: "profesor_no_puede", label: "El profesor no podrá realizar la sesión" },
  { value: "reprogramada", label: "La sesión se cambió para otro día" },
  { value: "acuerdo", label: "Se acordó no realizar esta sesión" },
  { value: "evento", label: "La alumna tiene un evento u otro compromiso" },
  { value: "consulta_medica", label: "La alumna tiene una consulta médica" },
  { value: "otro", label: "Otro motivo" },
] as const;

function fechaBonita(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function CancelarSesion1a1ProfesorModal({
  sesion,
  alumnaNombre,
  onClose,
  onResolved,
}: {
  sesion: SesionCancelableProfesor;
  alumnaNombre?: string | null;
  onClose: () => void;
  onResolved: () => void | Promise<void>;
}) {
  const { session, role, roles } = useAuth();
  const uid = session?.user.id;
  const puedeResolver = uid === sesion.profesor_id || role === "admin" || roles.includes("admin");
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [saving, setSaving] = useState(false);

  const confirmar = async () => {
    if (!uid || !puedeResolver || saving) return;
    if (!motivo) return toast.error("Selecciona el motivo por el que no se realizará la sesión.");

    const opcion = MOTIVOS.find((m) => m.value === motivo);
    if (!opcion) return;
    const extra = detalle.trim();
    if (motivo === "otro" && extra.length < 5) {
      return toast.error("Escribe el motivo (mínimo 5 caracteres).");
    }
    const razon = motivo === "otro"
      ? extra
      : extra
        ? `${opcion.label}. ${extra}`
        : opcion.label;

    setSaving(true);
    const { error } = await supabase.rpc("cancelar_sesion_1a1", {
      _id: sesion.id,
      _razon: razon,
    });

    if (error) {
      setSaving(false);
      return toast.error(error.message || "No se pudo resolver la sesión.");
    }

    const profesorNombre = formatNombre(session?.user.user_metadata?.nombre_completo as string | undefined)
      || session?.user.email
      || "Tu profesor";

    const { error: notifError } = await supabase.rpc("notificar", {
      _actor: uid,
      _cuerpo: `La sesión 1 a 1 del ${fechaBonita(sesion.fecha)} a las ${sesion.hora_inicio.slice(0, 5)} fue marcada como no realizada. Motivo: ${razon}. Profesor: ${profesorNombre}.`,
      _referencia: sesion.id,
      _tipo: "sesion_no_realizada",
      _titulo: "Sesión 1 a 1 no realizada",
      _url: "/agenda-1a1",
      _usuarios: [sesion.alumna_id],
    });

    setSaving(false);
    await onResolved();
    window.dispatchEvent(new Event("adn:sesion-reprogramada"));
    window.dispatchEvent(new Event("adn:horas-actualizadas"));

    if (notifError) {
      toast.success("Sesión resuelta y motivo registrado. No se pudo enviar la notificación.");
    } else {
      toast.success("Sesión marcada como no realizada y alumna notificada.");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[145] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="p-5 text-white relative" style={{ background: "linear-gradient(135deg,#7f1d1d,#b91c1c)" }}>
          <button type="button" onClick={onClose} disabled={saving} className="absolute right-3 top-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Agenda 1 a 1</div>
          <h3 className="text-xl font-bold mt-1">Esta sesión no se realizará</h3>
          <p className="text-sm opacity-90 mt-1">El motivo quedará registrado y la alumna podrá volver a reservar después de resolver esta sesión.</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-semibold">{alumnaNombre || "Alumna"}</div>
            <div className="text-xs text-muted-foreground mt-0.5 capitalize">{fechaBonita(sesion.fecha)} · {sesion.hora_inicio.slice(0, 5)}</div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>No uses esta opción si la sesión sí se realizó. En ese caso registra la duración real. Aquí solo se resuelven sesiones que no se dieron o que fueron agendadas por error.</span>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motivo obligatorio *</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background text-sm">
              <option value="">Selecciona una razón…</option>
              {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalle {motivo === "otro" ? "*" : "(opcional)"}</label>
            <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} placeholder="Ej. La alumna avisó por WhatsApp que tenía una cita médica…" className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background resize-y text-sm" />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border text-sm">Volver</button>
            <button type="button" onClick={() => void confirmar()} disabled={saving || !motivo} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Guardando…" : "Confirmar que no se realizará"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
