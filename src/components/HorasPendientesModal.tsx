import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type ResumenPendientes = {
  cantidad: number;
  antiguas: number;
  fecha_antigua: string | null;
};

export function HorasPendientesModal() {
  const { session, role } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [resumen, setResumen] = useState<ResumenPendientes | null>(null);

  useEffect(() => {
    if (!session?.user.id) {
      setResumen(null);
      return;
    }

    let cancelado = false;
    (async () => {
      // El Líder/Dueño sincroniza en segundo plano las incidencias de todo el equipo.
      // No se le muestra el modal de profesor; las alertas llegan por notificaciones.
      if (role === "admin") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("sincronizar_incidencias_horas_equipo");
        if (!cancelado) setResumen(null);
        return;
      }

      if (role !== "soporte") {
        if (!cancelado) setResumen(null);
        return;
      }

      // La función se agrega en la migración de esta misma rama. El cast solo
      // mantiene compatibilidad hasta que Lovable regenere los tipos de Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("sincronizar_incidencias_horas");
      if (cancelado || error || !data) return;
      const r = data as ResumenPendientes;
      setResumen({
        cantidad: Number(r.cantidad) || 0,
        antiguas: Number(r.antiguas) || 0,
        fecha_antigua: r.fecha_antigua || null,
      });
    })();

    return () => { cancelado = true; };
  }, [session?.user.id, role]);

  // En la propia pantalla de registro no bloqueamos los controles que necesita usar.
  if (pathname.startsWith("/mis-clases-asignadas")) return null;
  if (!resumen || resumen.cantidad <= 0) return null;

  const fecha = resumen.fecha_antigua
    ? new Date(`${resumen.fecha_antigua}T00:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden">
        <div className="p-5 text-white" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
          <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center mb-3">
            <Clock className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold">Registra tus horas pendientes</h2>
          <p className="text-sm opacity-90 mt-1">Necesitamos cerrar correctamente tus clases y sesiones antes de continuar.</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 flex-shrink-0" />
            <div>
              <div className="font-semibold">
                {resumen.cantidad} {resumen.cantidad === 1 ? "sesión o clase pendiente" : "sesiones o clases pendientes"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Falta registrar la duración real. {fecha ? `La más antigua corresponde al ${fecha}.` : ""}
              </div>
              {resumen.antiguas > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                  {resumen.antiguas} {resumen.antiguas === 1 ? "registro lleva" : "registros llevan"} 3 días o más pendiente. El Líder recibe una alerta para seguimiento.
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            En “Mis clases asignadas” usa <strong>Registrar duración</strong> en cada clase o sesión pendiente. Al guardarla, la incidencia se cierra automáticamente.
          </p>

          <button
            onClick={() => navigate({ to: "/mis-clases-asignadas" })}
            className="w-full px-4 py-2.5 rounded-xl bg-violet-gradient text-white text-sm font-semibold"
          >
            Ir a registrar horas
          </button>
        </div>
      </div>
    </div>
  );
}
