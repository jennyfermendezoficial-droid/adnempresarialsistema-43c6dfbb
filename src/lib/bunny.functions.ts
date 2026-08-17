import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

function readConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  if (!libraryId || !apiKey || !cdnHostname) return null;
  return { libraryId, apiKey, cdnHostname };
}

function getConfig() {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error("Bunny no está configurado.");
  }
  return cfg;
}

async function ensureStaff(supabase: any, userId: string) {
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
    const cfg = readConfig();
    if (!cfg) return { libraryId: null, cdnHostname: null };
    return { libraryId: cfg.libraryId, cdnHostname: cfg.cdnHostname };
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

    // 2) Firma TUS válida por 24h (Bunny exige SHA-256)
    const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const signature = createHash("sha256")
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

// Estado de un video de Bunny.
// status: 0=Created 1=Uploaded 2=Processing 3=Transcoding 4=Finished
//         5=Error 6=UploadFailed 7=JitSegmenting 8=JitPlaylistsCreated
export const getBunnyVideoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { videoId: string }) =>
    z.object({ videoId: z.string().min(1).max(64) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    // Authorize: caller must be staff OR have access to a lección using this video.
    // RLS on `lecciones` already scopes visibility to staff and users with course access,
    // so a successful lookup here implies the caller can see the video.
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isStaff = ((roles ?? []) as { role: string }[])
      .some((r) => r.role === "admin" || r.role === "soporte");
    if (!isStaff) {
      const { data: lec } = await context.supabase
        .from("lecciones").select("id").eq("bunny_video_id", data.videoId).maybeSingle();
      if (!lec) throw new Error("No autorizado para consultar este video.");
    }
    const { libraryId, apiKey } = getConfig();
    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${data.videoId}`,
      { headers: { AccessKey: apiKey, accept: "application/json" } }
    );
    if (!res.ok) {
      throw new Error(`Bunny status ${res.status}`);
    }
    const v = (await res.json()) as {
      status: number;
      encodeProgress: number;
      availableResolutions: string | null;
      length: number;
    };
    return {
      status: v.status,
      encodeProgress: v.encodeProgress ?? 0,
      ready: v.status === 4 || v.status === 3 || v.status === 8,
      failed: v.status === 5 || v.status === 6,
    };
  });