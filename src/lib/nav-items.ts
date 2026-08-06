import {
  Home, BookOpen, CalendarDays, Users,
  ShieldCheck, Wallet, Calendar,
  Bell, GraduationCap, Radio,
} from "lucide-react";

export interface NavItem { to: string; label: string; icon: typeof Home }

export const inicioItems: NavItem[] = [
  { to: "/inicio", label: "Inicio", icon: Home },
  { to: "/tutoriales", label: "Tutoriales", icon: GraduationCap },
];
export const soporteItems: NavItem[] = [
  { to: "/agenda-1a1", label: "Agenda 1 a 1", icon: CalendarDays },
];
export const academiaItems: NavItem[] = [
  { to: "/cursos", label: "Cursos", icon: BookOpen },
  { to: "/clases-en-vivo", label: "Clases en vivo", icon: Radio },
  { to: "/calendario-clases", label: "Calendario de clases", icon: Calendar },
  { to: "/mis-clases-asignadas", label: "Mis clases asignadas", icon: Bell },
];
export const comunidadItems: NavItem[] = [
  { to: "/miembros", label: "Miembros", icon: Users },
];
export const adminItems: NavItem[] = [
  { to: "/permisos", label: "Permisos", icon: ShieldCheck },
  { to: "/acceso-cursos", label: "Acceso a cursos", icon: BookOpen },
  { to: "/acceso-clases-en-vivo", label: "Acceso a clases en vivo", icon: Radio },
  { to: "/pagos", label: "Pagos e informes", icon: Wallet },
];
