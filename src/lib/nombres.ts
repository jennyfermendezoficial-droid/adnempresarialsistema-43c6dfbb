const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "dos", "van", "von", "di"]);

/** Formatea un nombre propio: "maria de la cruz" -> "Maria de la Cruz" */
export function formatNombre(valor?: string | null): string {
  const limpio = (valor ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return "";
  if (limpio.includes("@")) return limpio; // es un email, se deja igual
  return limpio
    .split(" ")
    .map((w, i) =>
      i > 0 && MINUSCULAS.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}