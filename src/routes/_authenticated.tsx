import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo, BrandName } from "@/components/Logo";

export const Route = createFileRoute("/_authenticated")({ component: AuthedLayout });

function AuthedLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [session, loading, navigate]);

  if (loading || !session) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Cargando…</div>;
  }

  if (profile && profile.estado !== "activo") {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="w-full max-w-md p-8 rounded-2xl border bg-card text-center">
          <div className="flex items-center justify-center gap-3 mb-6"><Logo /><BrandName /></div>
          <h2 className="text-xl font-semibold mb-2">
            {profile.estado === "pendiente_aprobacion" ? "Cuenta pendiente de aprobación" : "Cuenta desactivada"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {profile.estado === "pendiente_aprobacion"
              ? "El administrador debe activar tu cuenta. Te avisaremos cuando esté lista."
              : "Contacta al administrador para reactivar tu acceso."}
          </p>
          <button onClick={signOut} className="text-sm font-semibold" style={{ color: "var(--violet)" }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-2)" }}>
        <Outlet />
      </main>
    </div>
  );
}