import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarClock, Check, X } from "lucide-react";
import { formatNombre } from "@/lib/nombres";

interface Profile { id: string; nombre_completo: string; email: string }
interface Row { dia_semana: number; activo: boolean; hora_inicio: string; hora_fin: string }

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export function DisponibilidadAgendaModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [days, setDays] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true });
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("disponibilidad")
        .select("dia_semana,activo,hora_inicio,hora_fin")
        .eq("profesor_id", profile.id)
        .order("dia_semana");
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const next: Record<number, boolean> = { 0: true, 1: true, 2: true, 3: true, 4: true };
      ((data ?? []) as unknown as Row[]).forEach((row) => { next[row.dia_semana] = row.activo; });
      setDays(next);
      setLoading(false);
    })();
  }, [profile.id]);

  const toggleDay = async (day: number) => {
    const next = !days[day];
    setSaving(day);
    const { error } = await supabase
      .from("disponibilidad")
      .upsert({
        profesor_id: profile.id,
        dia_semana: day,
        hora_inicio: "15:00",
        hora_fin: "19:00",
        activo: next,
      }, { onConflict: "profesor_id,dia_semana" });
    setSaving(null);
    if (error) return toast.error(error.message);
    setDays((prev) => ({ ...prev, [day]: next }));
    toast.success(`${DIAS[day]}: ${next ? "disponible" : "no disponible"}`);
  };

  const setAll = async (activo: boolean) => {
    setSaving(99);
    const rows = DIAS.map((_, day) => ({
      profesor_id: profile.id,
      dia_semana: day,
      hora_inicio: "15:00",
      hora_fin: "19:00",
      activo,
    }));
    const { error } = await supabase.from("disponibilidad").upsert(rows, { onConflict: "profesor_id,dia_semana" });
    setSaving(null);
    if (error) return toast.error(error.message);
    setDays({ 0: activo, 1: activo, 2: activo, 3: activo, 4: activo });
    toast.success(activo ? "Horario restaurado para lunes a viernes." : "Todos los días quedaron bloqueados.");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 text-violet">
              <CalendarClock className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Disponibilidad Agenda 1 a 1</span>
            </div>
            <h3 className="text-lg font-semibold mt-1">{formatNombre(profile.nombre_completo) || profile.email}</h3>
            <p className="text-xs text-muted-foreground mt-1">Horario reservable: 15:00 a 19:00. Configura los días en los que esta persona no atiende.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando disponibilidad…</div>
        ) : (
          <div className="space-y-2">
            {DIAS.map((day, index) => {
              const activo = days[index];
              return (
                <button key={day} type="button" disabled={saving !== null} onClick={() => toggleDay(index)} className="w-full flex items-center justify-between p-3 rounded-xl border hover:bg-muted/50 transition">
                  <div className="text-left">
                    <div className="text-sm font-semibold">{day}</div>
                    <div className="text-[11px] text-muted-foreground">15:00 – 19:00</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${activo ? "bg-violet-gradient text-white" : "border text-muted-foreground"}`}>
                    {activo ? <><Check className="w-3.5 h-3.5" /> Disponible</> : <><X className="w-3.5 h-3.5" /> No disponible</>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5 pt-4 border-t">
          <button disabled={saving !== null} onClick={() => setAll(true)} className="px-3 py-2 rounded-lg border text-xs font-semibold">Todos disponibles</button>
          <button disabled={saving !== null} onClick={() => setAll(false)} className="px-3 py-2 rounded-lg border text-xs font-semibold">Bloquear todos</button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-xs font-semibold">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
