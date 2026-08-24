import { supabase } from "@/integrations/supabase/client";

const BUCKET = "bank-images";
const MAX_BYTES = 5 * 1024 * 1024;

function extension(file: File) {
  const raw = file.name.split(".").pop() || "jpg";
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
}

function validar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
  if (file.size > MAX_BYTES) throw new Error("La imagen no puede superar 5 MB.");
}

async function subir(file: File, path: string) {
  validar(file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || undefined,
  });
  if (error) throw new Error(`No se pudo subir la imagen bancaria: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("No se pudo obtener la URL de la imagen bancaria.");
  return data.publicUrl;
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
