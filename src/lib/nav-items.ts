import {
  Home, BookOpen, CalendarDays, Users,
  ShieldCheck, Wallet, Calendar,
  Bell, Radio, Sparkles, Layers3,
} from "lucide-react";

export interface NavItem { to: string; label: string; icon: typeof Home }

/** Orden principal del menú para alumnos. El equipo filtra Cursos/Clases y usa la gestión unificada. */
export const mainItems: NavItem[] = [
  { to: "/comunidad", label: "Comunidad", icon: Sparkles },
  { to: "/cursos", label: "Cursos", icon: BookOpen },
  { to: "/clases-en-vivo", label: "Clases en vivo", icon: Radio },
  { to: "/calendario-clases", label: "Calendario de clases", icon: Calendar },
  { to: "/agenda-1a1", label: "Agenda 1 a 1", icon: CalendarDays },
  { to: "/miembros", label: "Miembros", icon: Users },
  { to: "/inicio", label: "Inicio", icon: Home },
];

/** Solo profesores (soporte) y admin. */
export const staffItems: NavItem[] = [
  { to: "/clases-en-vivo", label: "Cursos y clases", icon: Layers3 },
  { to: "/mis-clases-asignadas", label: "Mis clases asignadas", icon: Bell },
];

export const adminItems: NavItem[] = [
  { to: "/admin", label: "Admin", icon: ShieldCheck },
];

/** Acceso privado (líderes y Erick Silva). */
export const pagosItems: NavItem[] = [
  { to: "/pagos", label: "Pagos e informes", icon: Wallet },
];
