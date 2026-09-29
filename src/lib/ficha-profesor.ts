export function normalizarNombreFicha(nombre: string | null | undefined): string {
  return (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function esCuentaEspecialFicha(nombre: string | null | undefined): boolean {
  const n = normalizarNombreFicha(nombre);
  const partes = new Set(n.split(" ").filter(Boolean));
  return (partes.has("erick") && partes.has("troya"))
    || (partes.has("jaime") && partes.has("zambrano"));
}

export function debeMostrarAccesoFicha(params: {
  nombre?: string | null;
  role?: string | null;
  roles?: string[] | null;
}): boolean {
  return params.role === "soporte"
    || Boolean(params.roles?.includes("soporte"))
    || esCuentaEspecialFicha(params.nombre);
}
