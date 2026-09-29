export interface ModuloCardMeta {
  imageUrl: string | null;
}

const PREFIX = "[[ADN_MODULO_CARD:";
const SUFFIX = "]]";

export function parseModuloCard(descripcion: string | null | undefined): {
  meta: ModuloCardMeta;
  descripcion: string;
} {
  const raw = descripcion ?? "";
  if (!raw.startsWith(PREFIX)) {
    return { meta: { imageUrl: null }, descripcion: raw };
  }

  const end = raw.indexOf(SUFFIX, PREFIX.length);
  if (end < 0) return { meta: { imageUrl: null }, descripcion: raw };

  try {
    const parsed = JSON.parse(raw.slice(PREFIX.length, end)) as Partial<ModuloCardMeta>;
    const visible = raw.slice(end + SUFFIX.length).replace(/^\s*\n?/, "");
    return {
      meta: { imageUrl: typeof parsed.imageUrl === "string" && parsed.imageUrl ? parsed.imageUrl : null },
      descripcion: visible,
    };
  } catch {
    return { meta: { imageUrl: null }, descripcion: raw };
  }
}

export function serializarModuloCard(
  descripcion: string | null | undefined,
  imageUrl: string | null | undefined,
) {
  const limpio = (descripcion ?? "").trim();
  const meta: ModuloCardMeta = { imageUrl: imageUrl || null };
  return `${PREFIX}${JSON.stringify(meta)}${SUFFIX}${limpio ? `\n${limpio}` : ""}`;
}
