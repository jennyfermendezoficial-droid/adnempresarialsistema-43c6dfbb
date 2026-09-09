import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNav } from "@/components/TopNav";
import { Logo, BrandName } from "@/components/Logo";
import { PostClassRatingModal } from "@/components/PostClassRatingModal";
import { FichaProfesorModal } from "@/components/FichaProfesorModal";
import { AlertaRegistroProfesor } from "@/components/AlertaRegistroProfesor";
import { PendientesRegistroProfesorPanel } from "@/components/PendientesRegistroProfesorPanel";
import { RegistroHistoricoClaseProfesor } from "@/components/RegistroHistoricoClaseProfesor";
import { PagosControlPanel } from "@/components/pagos/PagosControlPanel";
import { ChatsPopover } from "@/components/ChatsPopover";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { Menu, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({ component: AuthedLayout });

function AuthedLayout() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [session, loading, navigate]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  useGlobalNotifications();

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
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 h-full w-[85%] max-w-[320px] animate-in slide-in-from-left">
            <AppSidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto flex flex-col min-w-0" style={{ background: "var(--bg-2)" }}>
        <div className="hidden lg:block">
          <TopNav />
        </div>

        <header
          className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-3 h-14 border-b"
          style={{
            background: "var(--deep-2)",
            borderColor: "var(--line-dark)",
            color: "var(--violet-light)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg hover:bg-white/10 active:bg-white/15"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Logo size={26} />
            <BrandName className="text-[14px] truncate" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ChatsPopover />
            <NotificationsPopover />
          </div>
        </header>
        <div className="flex-1">
          {pathname.startsWith("/pagos") && <PagosControlPanel />}
          {pathname.startsWith("/mis-clases-asignadas") && <RegistroHistoricoClaseProfesor />}
          {pathname.startsWith("/mis-clases-asignadas") && <PendientesRegistroProfesorPanel />}
          <Outlet />
        </div>
      </main>
      <PostClassRatingModal />
      <FichaProfesorModal />
      <AlertaRegistroProfesor />
    </div>
  );
}
