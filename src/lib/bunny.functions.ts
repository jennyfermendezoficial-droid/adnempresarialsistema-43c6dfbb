import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

function getConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!libraryId || !apiKey || !cdnHostname) {
    throw new Error("Bunny no está configurado.");
  }
  return { libraryId, apiKey, cdnHostname };
}

async function ensureStaff(supabase: ReturnType<typeof Object>, userId: string) {
  // @ts-expect-error supabase client typing comes from middleware context
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("soporte")) {
    throw new Error("Solo admin o soporte pueden subir videos.");
  }
}

// Devuelve config pública (libraryId, cdn) para reproducir embeds.
export const getBunnyPublicConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { libraryId, cdnHostname } = getConfig();
    return { libraryId, cdnHostname };
  });

// Crea un video vacío en Bunny y devuelve credenciales TUS firmadas
// para que el navegador suba el archivo directamente (sin pasar el API key).
export const createBunnyVideoForUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string }) =>
    z.object({ title: z.string().min(1).max(200) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId);
    const { libraryId, apiKey } = getConfig();

    // 1) Crear el registro de video
    const createRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ title: data.title }),
      }
    );
    if (!createRes.ok) {
      throw new Error(`Bunny create ${createRes.status}: ${await createRes.text()}`);
    }
    const video = (await createRes.json()) as { guid: string };

    // 2) Firma TUS válida por 24h
    const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const signature = createHash("sha512")
      .update(`${libraryId}${apiKey}${expirationTime}${video.guid}`)
      .digest("hex");

    return {
      videoId: video.guid,
      libraryId,
      authorizationSignature: signature,
      authorizationExpire: expirationTime,
    };
  });

// Elimina un video de Bunny.
export const deleteBunnyVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string }) =>
    z.object({ videoId: z.string().min(1).max(64) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId);
    const { libraryId, apiKey } = getConfig();
    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${data.videoId}`,
      { method: "DELETE", headers: { AccessKey: apiKey } }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Bunny delete ${res.status}: ${await res.text()}`);
    }
    return { ok: true };
  });