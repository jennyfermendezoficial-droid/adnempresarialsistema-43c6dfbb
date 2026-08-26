import { useAuth } from "@/lib/auth-context";
import { SesionPendienteAlumnoPanel, useSesionesPendientesAlumno } from "@/components/SesionPendienteAlumno";

export function AgendaSesionPendienteGuard() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const esAlumna = role === "usuario";
  const { pendientes, loading, recargar } = useSesionesPendientesAlumno(uid, esAlumna);

  if (!esAlumna || !uid || loading || pendientes.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm overflow-y-auto p-4 md:p-8">
      <div className="min-h-full grid place-items-center">
        <div className="w-full max-w-2xl rounded-3xl border bg-card p-5 shadow-2xl">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-bold">Agenda 1 a 1</div>
            <h2 className="text-xl font-semibold mt-1">Primero resuelve tu sesión pendiente</h2>
            <p className="text-sm text-muted-foreground mt-1">
              No puedes crear una reserva nueva mientras una sesión anterior siga sin realizarse, sin reprogramarse o sin registrarse por el Profesor.
            </p>
          </div>
          <SesionPendienteAlumnoPanel
            pendientes={pendientes}
            onReprogramada={async () => {
              await recargar();
              window.setTimeout(() => window.location.reload(), 150);
            }}
          />
        </div>
      </div>
    </div>
  );
}
