export interface ContenidoEquipoMeta {
  equipo: true;
  parentId: string | null;
  nested: boolean;
}

// Marcadores invisibles para guardar configuración sin ensuciar la descripción visible.
const INV_START = "\u2063\u2063";
const INV_END = "\u2064\u2064";
const ZERO = "\u200b";
const ONE = "\u200c";

// Compatibilidad con la primera versión de esta rama.
const LEGACY_PREFIX = "[[ADN_EQUIPO:";
const LEGACY_SUFFIX = "]]";

function encodeInvisible(value: string) {
  return Array.from(value)
    .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, "0"))
    .join("")
    .replace(/0/g, ZERO)
    .replace(/1/g, ONE);
}

function decodeInvisible(value: string) {
  const bits = value.replace(new RegExp(ZERO, "g"), "0").replace(new RegExp(ONE, "g"), "1");
  if (!bits.length || bits.length % 8 !== 0) throw new Error("metadata inválida");
  let out = "";
  for (let i = 0; i < bits.length; i += 8) out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  return out;
}

function normalizarMeta(parsed: Partial<ContenidoEquipoMeta>): ContenidoEquipoMeta | null {
  if (parsed.equipo !== true) return null;
  return {
    equipo: true,
    parentId: typeof parsed.parentId === "string" ? parsed.parentId : null,
    nested: parsed.nested === true,
  };
}

export function parseContenidoEquipo(descripcion: string | null | undefined): {
  meta: ContenidoEquipoMeta | null;
  descripcion: string;
} {
  const raw = descripcion ?? "";

  const start = raw.indexOf(INV_START);
  const end = start >= 0 ? raw.indexOf(INV_END, start + INV_START.length) : -1;
  if (start >= 0 && end > start) {
    try {
      const json = decodeInvisible(raw.slice(start + INV_START.length, end));
      const meta = normalizarMeta(JSON.parse(json) as Partial<ContenidoEquipoMeta>);
      if (meta) return { meta, descripcion: raw.slice(0, start).trimEnd() };
    } catch {
      // Continúa con compatibilidad legacy.
    }
  }

  if (raw.startsWith(LEGACY_PREFIX)) {
    const legacyEnd = raw.indexOf(LEGACY_SUFFIX, LEGACY_PREFIX.length);
    if (legacyEnd >= 0) {
      try {
        const meta = normalizarMeta(
          JSON.parse(raw.slice(LEGACY_PREFIX.length, legacyEnd)) as Partial<ContenidoEquipoMeta>,
        );
        if (meta) {
          return {
            meta,
            descripcion: raw.slice(legacyEnd + LEGACY_SUFFIX.length).replace(/^\s*\n?/, ""),
          };
        }
      } catch {
        // Se trata como descripción normal si la metadata está dañada.
      }
    }
  }

  return { meta: null, descripcion: raw };
}

export function serializarContenidoEquipo(
  descripcion: string | null | undefined,
  parentId: string | null,
  nested: boolean,
) {
  const limpio = (descripcion ?? "").trim();
  const meta: ContenidoEquipoMeta = { equipo: true, parentId, nested };
  return `${limpio}${INV_START}${encodeInvisible(JSON.stringify(meta))}${INV_END}`;
}

export function esContenidoEquipo(descripcion: string | null | undefined) {
  return parseContenidoEquipo(descripcion).meta?.equipo === true;
}

export function descripcionVisible(descripcion: string | null | undefined) {
  return parseContenidoEquipo(descripcion).descripcion;
}
