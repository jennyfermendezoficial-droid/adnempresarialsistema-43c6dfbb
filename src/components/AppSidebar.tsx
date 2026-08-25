import { formatNombre } from "@/lib/nombres";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Landmark, LogOut } from "lucide-react";
import { Logo, BrandName } from "./Logo";
import { useAuth } from "@/lib/auth-context";
import { InstallAppButton } from "./InstallAppButton";
import { mainItems, staffItems, adminItems, pagosItems } from "@/lib/nav-items";
import { puedeVerPagos } from "@/lib/roles";
import { debeMostrarAccesoFicha } from "@/lib/ficha-profesor";

interface Item { to: string; label: string; icon: typeof Home; }

interface AppSidebarProps { onNavigate?: () => void }

export function AppSidebar({ onNavigate }: AppSidebarProps = {}) {
  const { profile, role, roles, signOut, session } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const puedeFicha = debeMostrarAccesoFicha({
    nombre: profile?.nombre_completo,
    role,
    roles,
  });

  const abrirDatosPago = () => {
    onNavigate?.();
    window.dispatchEvent(new Event("adn:abrir-datos-pago"));
  };

  return (
    <aside
      className="h-full md:h-screen flex flex-col px-4 py-5 relative overflow-y-auto border-r"
      style={{
        background: "var(--deep-2)",
        color: "var(--violet-light)",
        borderColor: "var(--line-dark)",
        width: "100%",
        maxWidth: 320,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle at top right, rgba(124,107,255,.15), transparent 60%)" }}
      />
      <div className="relative z-10 flex flex-col h-full">
        <Link to="/inicio" onClick={onNavigate} className="flex items-center gap-3 px-1.5 mb-6">
          <Logo size={32} />
          <BrandName className="text-[15px]" />
        </Link>

        <SectionLabel>Menú</SectionLabel>
        <Nav items={mainItems} isActive={isActive} onClick={onNavigate} />

        {puedeFicha && (
          <button
            onClick={abrirDatosPago}
            className="mt-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors border border-transparent text-left"
            style={{ color: "var(--violet-light)" }}
          >
            <Landmark className="w-[18px] h-[18px] flex-shrink-0" />
            <span>Datos de pago</span>
          </button>
        )}

        {(role === "admin" || role === "soporte") && (
          <>
            <SectionLabel className="mt-3">Profesores</SectionLabel>
            <Nav items={staffItems} isActive={isActive} onClick={onNavigate} />
            {role === "admin" && (
              <>
                <SectionLabel className="mt-3">Admin</SectionLabel>
                <Nav items={adminItems} isActive={isActive} onClick={onNavigate} />
              </>
            )}
          </>
        )}
        {puedeVerPagos(role, session?.user.id) && (
          <>
            <SectionLabel className="mt-3">Pagos</SectionLabel>
            <Nav items={pagosItems} isActive={isActive} onClick={onNavigate} />
          </>
        )}

        <div className="mt-auto pt-4 border-t" style={{ borderColor: "var(--line-dark)" }}>
          <div className="mb-3"><InstallAppButton compact /></div>
          <Link
            to="/perfil"
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5"
          >
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-white text-sm font-semibold"
              style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
            >
              {(formatNombre(profile?.nombre_completo) || profile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {formatNombre(profile?.nombre_completo) || "Mi cuenta"}
              </div>
              <div className="text-[11px] uppercase tracking-wider opacity-70 truncate">
                {role || "usuario"}
              </div>
            </div>
          </Link>
          <button
            onClick={() => { onNavigate?.(); signOut(); }}
            className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-75 hover:opacity-100 hover:bg-white/5 transition"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-[10.5px] font-bold tracking-[0.14em] uppercase px-3 pt-3 pb-2 opacity-65 ${className}`}
      style={{ color: "var(--violet-soft)" }}
    >
      {children}
    </div>
  );
}

function Nav({ items, isActive, onClick }: { items: Item[]; isActive: (p: string) => boolean; onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: Icon }) => {
        const active = isActive(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors border border-transparent"
            style={
              active
                ? { background: "rgba(124,107,255,.18)", color: "#fff", borderColor: "rgba(124,107,255,.28)" }
                : { color: "var(--violet-light)" }
            }
          >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
