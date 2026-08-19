export interface ContenidoEquipoMeta {
  equipo: true;
  parentId: string | null;
  nested: boolean;
}

const PREFIX = "[[ADN_EQUIPO:";
const SUFFIX = "]]";

export function parseContenidoEquipo(descripcion: string | null | undefined): {
  meta: ContenidoEquipoMeta | null;
  descripcion: string;
} {
  const raw = descripcion ?? "";
  if (!raw.startsWith(PREFIX)) return { meta: null, descripcion: raw };

  const end = raw.indexOf(SUFFIX, PREFIX.length);
  if (end < 0) return { meta: null, descripcion: raw };

  try {
    const parsed = JSON.parse(raw.slice(PREFIX.length, end)) as Partial<ContenidoEquipoMeta>;
    if (parsed.equipo !== true) return { meta: null, descripcion: raw };
    const visible = raw.slice(end + SUFFIX.length).replace(/^\s*\n?/, "");
    return {
      meta: {
        equipo: true,
        parentId: typeof parsed.parentId === "string" ? parsed.parentId : null,
        nested: parsed.nested === true,
      },
      descripcion: visible,
    };
  } catch {
    return { meta: null, descripcion: raw };
  }
}

export function serializarContenidoEquipo(
  descripcion: string | null | undefined,
  parentId: string | null,
  nested: boolean,
) {
  const limpio = (descripcion ?? "").trim();
  const meta: ContenidoEquipoMeta = { equipo: true, parentId, nested };
  return `${PREFIX}${JSON.stringify(meta)}${SUFFIX}${limpio ? `\n${limpio}` : ""}`;
}

export function esContenidoEquipo(descripcion: string | null | undefined) {
  return parseContenidoEquipo(descripcion).meta?.equipo === true;
}

export function descripcionVisible(descripcion: string | null | undefined) {
  return parseContenidoEquipo(descripcion).descripcion;
}
