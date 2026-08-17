import type { AppRole } from "@/lib/auth-context";

export function roleLabel(role?: AppRole | null) {
  if (role === "admin") return "Líder / Dueño";
  if (role === "soporte") return "Profesor";
  return "Alumno";
}
