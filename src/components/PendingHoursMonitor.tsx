import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClockAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

interface PendingRow { profesor_id: string; pendientes: number; dias_max: number }

/** Revisa horas faltantes sin tocar Agenda ni las reservas. */
export function PendingHoursMonitor() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid || (role !== "soporte" && role !== "admin")) return;
    let alive = true;
    const run = async () => {
      const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: PendingRow[] | null; error: { message: string } | null }>;
      const { data } = await rpc("revisar_horas_pendientes", {});
      if (!alive) return;
      if (role === "soporte") {
        const own = (data ?? []).find((r) => r.profesor_id === uid);
        setCount(Number(own?.pendientes ?? 0));
      }
    };
    void run();
    const timer = window.setInterval(run, 5 * 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [uid, role]);

  if (role !== "soporte" || count <= 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border bg-card shadow-xl p-4">
      <div className="flex items-start gap-3">
        <ClockAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold">Tienes {count} registro{count === 1 ? "" : "s"} de horas pendiente{count === 1 ? "" : "s"}</div>
          <div className="text-xs text-muted-foreground mt-1">Registra la duración real de tus clases o sesiones terminadas para que puedan aparecer correctamente en Pagos e informes.</div>
          <Link to="/mis-clases-asignadas" className="inline-block mt-2 text-xs font-semibold text-violet">Registrar ahora →</Link>
        </div>
      </div>
    </div>
  );
}
