import type { AppRole } from "@/lib/auth-context";

const PAGOS_SOPORTE_EMAILS = new Set([
  "detroitsilva010@gmail.com",
]);

export function puedeGestionarPagos(role?: AppRole | null, email?: string | null) {
  if (role === "admin") return true;
  if (role !== "soporte") return false;
  return PAGOS_SOPORTE_EMAILS.has((email ?? "").trim().toLowerCase());
}
