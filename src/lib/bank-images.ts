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

function bucketNoExiste(message: string) {
  const m = message.toLowerCase();
  return m.includes("bucket not found") || m.includes("bucket does not exist") || m.includes("not found");
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

async function subir(file: File, path: string) {
  validar(file);

  const principal = await subirEnBucket(file, BUCKET, path);
  if (principal.url) return principal.url;

  if (!principal.error || !bucketNoExiste(principal.error.message)) {
    throw new Error(`No se pudo subir la imagen bancaria: ${principal.error?.message || "error desconocido"}`);
  }

  // Compatibilidad de despliegue: si la migración de bank-images aún no llegó a
  // la base publicada, usa el bucket de portadas que ya existe. Solo se guardan
  // logos bancarios (imágenes públicas), nunca documentos ni datos de la cuenta.
  const fallback = await subirEnBucket(file, FALLBACK_BUCKET, `logos-bancarios/${path}`);
  if (fallback.error) {
    throw new Error(`No se pudo subir la imagen bancaria: ${fallback.error.message}`);
  }
  if (!fallback.url) throw new Error("No se pudo obtener la URL de la imagen bancaria.");
  return fallback.url;
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
