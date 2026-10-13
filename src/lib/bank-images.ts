import { subirImagen } from "@/lib/cloudinary";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "bank-images";
const FALLBACK_BUCKET = "course-covers";
const MAX_BYTES = 5 * 1024 * 1024;

function extension(file: File) {
  const raw = file.name.split(".").pop() || "jpg";
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
}

function validar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
  if (file.size > MAX_BYTES) throw new Error("La imagen no puede superar 5 MB.");
}

async function subirEnBucket(file: File, bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || undefined,
  });
  if (error) return { url: null as string | null, error };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl || null, error: null };
}

function leerComoDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

/**
 * Último respaldo sin Storage: reduce el logo en el navegador y devuelve un
 * data URL pequeño. Los campos logo_url/banco_logo_url son texto, por lo que
 * el formulario puede funcionar incluso si la base publicada aún no tiene
 * ningún bucket de imágenes bancarias.
 */
async function imagenEmbebida(file: File): Promise<string> {
  const original = await leerComoDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo procesar la imagen bancaria."));
    img.src = original;
  });

  const limite = 320;
  const escala = Math.min(1, limite / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 1) * escala));
  const height = Math.max(1, Math.round((img.naturalHeight || 1) * escala));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen bancaria.");
  ctx.drawImage(img, 0, 0, width, height);

  // WebP mantiene los logos pequeños. Si el navegador no lo soporta, usa JPEG.
  const webp = canvas.toDataURL("image/webp", 0.82);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function subir(file: File, path: string) {
  validar(file);

  // 0) Cloudinary: destino principal de todas las imágenes.
  try { return await subirImagen(file, "adn/sistema"); } catch { /* respaldo */ }

  // 1) Bucket nuevo, cuando ya esté aplicado en Supabase.
  const principal = await subirEnBucket(file, BUCKET, path);
  if (principal.url) return principal.url;

  // 2) Bucket histórico de portadas, si existe en esta instalación.
  const fallback = await subirEnBucket(file, FALLBACK_BUCKET, `logos-bancarios/${path}`);
  if (fallback.url) return fallback.url;

  // 3) No bloquear Pagos por configuración de Storage. Para logos pequeños
  // guardamos una versión reducida en el mismo campo de texto de la cuenta.
  return imagenEmbebida(file);
}

export async function subirImagenBancoProfesor(file: File, userId: string) {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return subir(file, `profesores/${userId}/${Date.now()}-${uuid}.${extension(file)}`);
}

export async function subirImagenBancoEmpresa(file: File) {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return subir(file, `empresa/${Date.now()}-${uuid}.${extension(file)}`);
}
