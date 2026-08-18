export type AppRole = "admin" | "soporte" | "usuario";

/** Etiquetas visibles. Los valores internos NO cambian. */
export const ROLE_LABELS: Record<AppRole, string> = {
  usuario: "Alumno",
  soporte: "Profesor",
  admin: "Líder",
};

export function labelRol(role?: string | null): string {
  return ROLE_LABELS[(role ?? "usuario") as AppRole] ?? "Alumno";
}

export const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "usuario", label: "Alumno" },
  { value: "soporte", label: "Profesor" },
  { value: "admin", label: "Líder" },
];

/** Acceso privado a "Pagos e informes": líderes (admin) y Erick Silva. */
const PAGOS_UIDS = ["d0c055a2-1002-460e-a42c-4a65a9e59303"];

export function puedeVerPagos(role?: string | null, uid?: string | null): boolean {
  return role === "admin" || (!!uid && PAGOS_UIDS.includes(uid));
}
