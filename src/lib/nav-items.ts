import {
  Home, BookOpen, CalendarDays, Users,
  ShieldCheck, Wallet, Calendar, Landmark,
  Bell, Radio, Sparkles, Layers3,
} from "lucide-react";

export interface NavItem { to: string; label: string; icon: typeof Home }

/** Orden principal del menú (todos los usuarios). */
export const mainItems: NavItem[] = [
  { to: "/inicio", label: "Inicio", icon: Home },
  { to: "/comunidad", label: "Comunidad", icon: Sparkles },
  { to: "/cursos", label: "Cursos", icon: BookOpen },
  { to: "/clases-en-vivo", label: "Clases en vivo", icon: Radio },
  { to: "/calendario-clases", label: "Calendario de clases", icon: Calendar },
  { to: "/agenda-1a1", label: "Agenda 1 a 1", icon: CalendarDays },
  { to: "/miembros", label: "Miembros", icon: Users },
];

/** Profesores (soporte) y admin mantienen estos accesos. */
export const staffItems: NavItem[] = [
  { to: "/cursos-y-clases-equipo", label: "Cursos y clases", icon: Layers3 },
  { to: "/mis-clases-asignadas", label: "Mis clases asignadas", icon: Bell },
];

/** Solo Profesor: cuenta donde recibe sus pagos. */
export const professorItems: NavItem[] = [
  { to: "/datos-pago", label: "Datos de pago", icon: Landmark },
];

export const adminItems: NavItem[] = [
  { to: "/admin", label: "Admin", icon: ShieldCheck },
];

/** Acceso privado de gestión de pagos. */
export const pagosItems: NavItem[] = [
  { to: "/pagos", label: "Pagos e informes", icon: Wallet },
];
