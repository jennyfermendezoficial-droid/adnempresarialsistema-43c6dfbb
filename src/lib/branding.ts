import { supabase } from "@/integrations/supabase/client";
import { subirImagen } from "@/lib/cloudinary";

export interface BrandingConfig {
  systemLogoUrl: string | null;
  faviconUrl: string | null;
  appIconUrl: string | null;
  comunidadLogoUrl: string | null;
}

const VACIO: BrandingConfig = {
  systemLogoUrl: null,
  faviconUrl: null,
  appIconUrl: null,
  comunidadLogoUrl: null,
};

const META_INICIO = "[[ADN_BRANDING_V1]]";
const META_FIN = "[[/ADN_BRANDING_V1]]";

interface BrandingRowPrincipal {
  comunidad_mensaje: string | null;
}

interface BrandingRowLegacy {
  inicio_video_url: string | null;
  inicio_mensaje: string | null;
  inicio_titulo: string | null;
  comunidad_imagen_url: string | null;
}

function normalizar(raw: Partial<BrandingConfig> | null | undefined): BrandingConfig {
  return {
    systemLogoUrl: raw?.systemLogoUrl || null,
    faviconUrl: raw?.faviconUrl || null,
    appIconUrl: raw?.appIconUrl || null,
    comunidadLogoUrl: raw?.comunidadLogoUrl || null,
  };
}

function extraerMeta(texto: string | null | undefined): { visible: string; branding: BrandingConfig | null } {
  const raw = texto || "";
  const ini = raw.indexOf(META_INICIO);
  if (ini < 0) return { visible: raw, branding: null };
  const fin = raw.indexOf(META_FIN, ini + META_INICIO.length);
  if (fin < 0) return { visible: raw, branding: null };

  const json = raw.slice(ini + META_INICIO.length, fin);
  const visible = `${raw.slice(0, ini)}${raw.slice(fin + META_FIN.length)}`.trim();
  try {
    return { visible, branding: normalizar(JSON.parse(json) as Partial<BrandingConfig>) };
  } catch {
    return { visible, branding: null };
  }
}

function insertarMeta(textoVisible: string, cfg: BrandingConfig): string {
  const visible = textoVisible.trim();
  const meta = `${META_INICIO}${JSON.stringify(normalizar(cfg))}${META_FIN}`;
  return visible ? `${visible}\n${meta}` : meta;
}

function tieneAlgo(cfg: BrandingConfig) {
  return Boolean(cfg.systemLogoUrl || cfg.faviconUrl || cfg.appIconUrl || cfg.comunidadLogoUrl);
}

/**
 * El sistema histórico usa app_config con id=true. El branding se guarda como
 * metadata dentro de comunidad_mensaje para no requerir columnas ni migraciones
 * nuevas y, sobre todo, para no alterar la configuración existente de Inicio.
 *
 * Se conserva lectura del antiguo id=false para recuperar imágenes que se hayan
 * alcanzado a guardar con la primera versión del editor.
 */
export async function cargarBranding(): Promise<BrandingConfig> {
  const principal = await supabase
    .from("app_config")
    .select("comunidad_mensaje")
    .eq("id", true)
    .maybeSingle();

  if (!principal.error && principal.data) {
    const parsed = extraerMeta((principal.data as BrandingRowPrincipal).comunidad_mensaje);
    if (parsed.branding && tieneAlgo(parsed.branding)) return parsed.branding;
  }

  // Compatibilidad con la primera implementación del editor (id=false).
  const legacy = await supabase
    .from("app_config")
    .select("inicio_video_url,inicio_mensaje,inicio_titulo,comunidad_imagen_url")
    .eq("id", false)
    .maybeSingle();

  if (!legacy.error && legacy.data) {
    const row = legacy.data as BrandingRowLegacy;
    const cfg = normalizar({
      systemLogoUrl: row.inicio_video_url || null,
      faviconUrl: row.inicio_mensaje || null,
      appIconUrl: row.inicio_titulo || null,
      comunidadLogoUrl: row.comunidad_imagen_url || null,
    });
    if (tieneAlgo(cfg)) return cfg;
  }

  return VACIO;
}

export async function guardarBranding(cfg: BrandingConfig) {
  const normalizado = normalizar(cfg);
  const actual = await supabase
    .from("app_config")
    .select("comunidad_mensaje")
    .eq("id", true)
    .maybeSingle();

  if (actual.error) throw actual.error;

  const { visible } = extraerMeta((actual.data as BrandingRowPrincipal | null)?.comunidad_mensaje);
  const comunidad_mensaje = insertarMeta(visible, normalizado);

  const guardar = actual.data
    ? await supabase
        .from("app_config")
        .update({ comunidad_mensaje, updated_at: new Date().toISOString() })
        .eq("id", true)
    : await supabase
        .from("app_config")
        .upsert({ id: true, comunidad_mensaje, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (guardar.error) throw guardar.error;

  // Verificación real: si la lectura posterior no devuelve lo guardado, no se
  // muestra un falso "guardado" al administrador.
  const verificacion = await supabase
    .from("app_config")
    .select("comunidad_mensaje")
    .eq("id", true)
    .maybeSingle();
  if (verificacion.error || !verificacion.data) {
    throw verificacion.error || new Error("No se pudo verificar la configuración guardada.");
  }
  const persistido = extraerMeta((verificacion.data as BrandingRowPrincipal).comunidad_mensaje).branding;
  if (!persistido || JSON.stringify(persistido) !== JSON.stringify(normalizado)) {
    throw new Error("La configuración de imágenes no quedó persistida. Intenta guardar nuevamente.");
  }

  window.dispatchEvent(new CustomEvent("adn:branding-actualizado", { detail: normalizado }));
  return normalizado;
}

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo procesar la imagen."));
    };
    img.src = url;
  });
}

export async function prepararImagenBranding(file: File, formato: "1:1" | "original", maxSize = 512): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
  if (file.size > 8 * 1024 * 1024) throw new Error("La imagen no puede superar 8 MB.");

  const img = await cargarImagen(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");

  if (formato === "1:1") {
    const ladoOrigen = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.floor((img.naturalWidth - ladoOrigen) / 2);
    const sy = Math.floor((img.naturalHeight - ladoOrigen) / 2);
    const lado = Math.min(maxSize, ladoOrigen);
    canvas.width = lado;
    canvas.height = lado;
    ctx.drawImage(img, sx, sy, ladoOrigen, ladoOrigen, 0, 0, lado, lado);
  } else {
    const escala = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("No se pudo convertir la imagen.")), "image/webp", 0.88);
  });

  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-") || "imagen";
  return new File([blob], `${base}.webp`, { type: "image/webp" });
}

export async function subirImagenBranding(file: File): Promise<string> {
  try {
    return await subirImagen(file, "adn/sistema");
  } catch {
    // Hasta que Cloudinary esté configurado, se conserva un respaldo WebP
    // embebido para que el editor siga siendo funcional.
    return leerComoDataUrl(file);
  }
}
