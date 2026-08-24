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

interface BrandingRow {
  inicio_video_url: string | null;
  inicio_mensaje: string | null;
  inicio_titulo: string | null;
  comunidad_imagen_url: string | null;
}

export async function cargarBranding(): Promise<BrandingConfig> {
  const { data, error } = await supabase
    .from("app_config")
    .select("inicio_video_url,inicio_mensaje,inicio_titulo,comunidad_imagen_url")
    .eq("id", false)
    .maybeSingle();

  if (error || !data) return VACIO;
  const row = data as BrandingRow;
  return {
    systemLogoUrl: row.inicio_video_url || null,
    faviconUrl: row.inicio_mensaje || null,
    appIconUrl: row.inicio_titulo || null,
    comunidadLogoUrl: row.comunidad_imagen_url || null,
  };
}

export async function guardarBranding(cfg: BrandingConfig) {
  const payload = {
    id: false,
    inicio_video_url: cfg.systemLogoUrl,
    inicio_mensaje: cfg.faviconUrl,
    inicio_titulo: cfg.appIconUrl,
    comunidad_imagen_url: cfg.comunidadLogoUrl,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("app_config")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
  window.dispatchEvent(new CustomEvent("adn:branding-actualizado", { detail: cfg }));
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
    // Mientras Cloudinary no esté configurado, el panel sigue funcionando sin
    // depender de buckets: guarda una imagen WebP optimizada directamente.
    return leerComoDataUrl(file);
  }
}
