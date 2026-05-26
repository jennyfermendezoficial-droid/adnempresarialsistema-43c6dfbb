import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home, BookOpen, CalendarDays, Users, MessageSquare,
  ShieldCheck, Wallet, Gift, LogOut, Hash, Headphones, Calendar,
  Clock3, CalendarRange, Briefcase, Home as HomeIcon, BarChart3,
} from "lucide-react";
import { Logo, BrandName } from "./Logo";
import { useAuth } from "@/lib/auth-context";

interface Item { to: string; label: string; icon: typeof Home; }

const inicioItems: Item[] =  [{ to: "/inicio", label: "Inicio", icon: Home }];
const canalesItems: Item[] = [
  { to: "/general", label: "General", icon: Hash },
];
const staffCanalesItems: Item[] = [
  { to: "/chat-profesores", label: "Chat profesores", icon: Headphones },
];
const soporteItems: Item[] = [
  { to: "/chats",      label: "Chats",        icon: MessageSquare },
  { to: "/agenda-1a1", label: "Agenda 1 a 1", icon: CalendarDays },
];
const academiaItems: Item[] = [
  { to: "/cursos",            label: "Cursos",               icon: BookOpen },
  { to: "/calendario-clases", label: "Calendario de clases", icon: Calendar },
];
const comunidadItems: Item[] = [
  { to: "/miembros", label: "Miembros", icon: Users },
];
const miAgendaItems: Item[] = [
  { to: "/mi-agenda",     label: "Agenda diaria",  icon: Clock3 },
  { to: "/mi-calendario", label: "Calendario",     icon: CalendarRange },
  { to: "/mi-negocio",    label: "Negocio",        icon: Briefcase },
  { to: "/mi-casa",       label: "Casa",           icon: HomeIcon },
  { to: "/mis-reportes",  label: "Reportes",       icon: BarChart3 },
];
const adminItems: Item[] = [
  { to: "/permisos", label: "Permisos",         icon: ShieldCheck },
  { to: "/acceso-cursos", label: "Acceso a cursos", icon: BookOpen },
  { to: "/pagos",    label: "Pagos e informes", icon: Wallet },
  { to: "/bonos",    label: "Bonos",            icon: Gift },
];

interface AppSidebarProps { onNavigate?: () => void }

export function AppSidebar({ onNavigate }: AppSidebarProps = {}) {
  const { profile, role, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

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

        <SectionLabel>Inicio</SectionLabel>
        <Nav items={inicioItems} isActive={isActive} onClick={onNavigate} />

        <SectionLabel className="mt-3">Canales</SectionLabel>
        <Nav items={canalesItems} isActive={isActive} onClick={onNavigate} />
        {(role === "admin" || role === "soporte") && (
          <Nav items={staffCanalesItems} isActive={isActive} onClick={onNavigate} />
        )}

        <SectionLabel className="mt-3">Soporte</SectionLabel>
        <Nav items={soporteItems} isActive={isActive} onClick={onNavigate} />

        <SectionLabel className="mt-3">Academia</SectionLabel>
        <Nav items={academiaItems} isActive={isActive} onClick={onNavigate} />

        <SectionLabel className="mt-3">Comunidad</SectionLabel>
        <Nav items={comunidadItems} isActive={isActive} onClick={onNavigate} />

        {role === "usuario" && (
          <>
            <SectionLabel className="mt-3">Mi Agenda Emprendedora</SectionLabel>
            <Nav items={miAgendaItems} isActive={isActive} onClick={onNavigate} />
          </>
        )}

        {(role === "admin" || role === "soporte") && (
          <>
            <SectionLabel className="mt-3">Admin</SectionLabel>
            <Nav items={adminItems} isActive={isActive} onClick={onNavigate} />
          </>
        )}

        <div className="mt-auto pt-4 border-t" style={{ borderColor: "var(--line-dark)" }}>
          <Link
            to="/perfil"
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5"
          >
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-white text-sm font-semibold"
              style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
            >
              {(profile?.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {profile?.nombre_completo || "Mi cuenta"}
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