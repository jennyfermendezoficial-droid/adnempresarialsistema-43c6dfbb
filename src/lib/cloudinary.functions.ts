import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

const CARPETAS = [
  "adn/comunidad",
  "adn/avatares",
  "adn/cursos",
  "adn/chats",
  "adn/tareas",
  "adn/comprobantes",
] as const;

// Devuelve una firma de subida para que el navegador suba la imagen
// directamente a Cloudinary sin exponer el API secret.
export const firmarSubidaCloudinary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { carpeta: string }) =>
    z.object({ carpeta: z.enum(CARPETAS) }).parse(d)
  )
  .handler(async ({ data }) => {
    const cloudName = process.env["CLOUDINARY_CLOUD_NAME"];
    const apiKey = process.env["CLOUDINARY_API_KEY"];
    const apiSecret = process.env["CLOUDINARY_API_SECRET"];
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cloudinary no está configurado.");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const params = `folder=${data.carpeta}&timestamp=${timestamp}`;
    const signature = createHash("sha1").update(params + apiSecret).digest("hex");

    return { cloudName, apiKey, timestamp, folder: data.carpeta, signature };
  });
