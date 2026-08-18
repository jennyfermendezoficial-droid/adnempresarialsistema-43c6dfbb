import { firmarSubidaCloudinary } from "./cloudinary.functions";

export type CarpetaCloudinary =
  | "adn/comunidad"
  | "adn/avatares"
  | "adn/cursos"
  | "adn/chats"
  | "adn/tareas"
  | "adn/comprobantes";

export function esImagen(file: File): boolean {
  return file.type.startsWith("image/");
}

/** true si el valor guardado ya es una URL completa (Cloudinary u otra). */
export function esUrlAbsoluta(v: string | null | undefined): boolean {
  return !!v && /^https?:\/\//i.test(v);
}

/** Sube una imagen a Cloudinary y devuelve la URL pública final. */
export async function subirImagen(file: File, carpeta: CarpetaCloudinary): Promise<string> {
  const firma = await firmarSubidaCloudinary({ data: { carpeta } });

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", firma.apiKey);
  form.append("timestamp", String(firma.timestamp));
  form.append("folder", firma.folder);
  form.append("signature", firma.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`No se pudo subir la imagen (${res.status}): ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { secure_url?: string; url?: string };
  const url = json.secure_url || json.url;
  if (!url) throw new Error("Cloudinary no devolvió la URL de la imagen");
  return url;
}
