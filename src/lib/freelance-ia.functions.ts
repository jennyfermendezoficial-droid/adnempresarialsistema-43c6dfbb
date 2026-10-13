import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Usa la clave gratuita propia de Google AI Studio (GEMINI_API_KEY): no gasta créditos de Lovable.
const MODELO = "gemini-2.5-flash";

function aBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gemini(parts: unknown[]) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Falta conectar la clave gratuita de Gemini.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
  });
  if (res.status === 429) throw new Error("Se alcanzó el límite gratuito diario de Gemini; intenta más tarde.");
  if (!res.ok) {
    console.error("gemini", res.status, await res.text());
    throw new Error("La IA no pudo procesar la solicitud.");
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

async function verificarPagos(supabase: { rpc: (f: "puede_pagos", a: { _uid: string }) => PromiseLike<{ data: unknown }> }, uid: string) {
  const { data } = await supabase.rpc("puede_pagos", { _uid: uid });
  if (!data) throw new Error("No autorizado");
}

export const generarResumenFreelance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ usuario_id: z.string().uuid(), mes: z.number().int(), anio: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await verificarPagos(context.supabase as never, context.userId);
    const ini = `${data.anio}-${String(data.mes).padStart(2, "0")}-01`;
    const fin = new Date(data.anio, data.mes, 0).toISOString().slice(0, 10);
    const { data: acts, error } = await context.supabase.from("freelance_actividades")
      .select("fecha,titulo,descripcion,horas,archivo_path,archivo_tipo")
      .eq("usuario_id", data.usuario_id).gte("fecha", ini).lte("fecha", fin).order("fecha");
    if (error) throw new Error(error.message);
    if (!acts?.length) throw new Error("No hay actividades en este mes.");

    const parts: unknown[] = [{
      text: "Eres asistente administrativo. Resume en español, en 4 a 8 viñetas cortas, lo más importante que hizo este freelance en el mes, " +
        "usando solo lo que dicen sus actividades y archivos adjuntos. No inventes. Sin introducción.\n\nActividades:\n" +
        acts.map((a) => `- ${a.fecha} · ${a.titulo} (${a.horas} h): ${a.descripcion ?? ""}`).join("\n"),
    }];
    let tam = 0;
    for (const a of acts) {
      if (!a.archivo_path || tam > 15_000_000) continue;
      const { data: blob } = await context.supabase.storage.from("freelance").download(a.archivo_path);
      if (!blob) continue;
      const buf = await blob.arrayBuffer();
      tam += buf.byteLength;
      parts.push({ inline_data: { mime_type: a.archivo_tipo || blob.type || "application/pdf", data: aBase64(buf) } });
    }
    const resumen = await gemini(parts);
    if (!resumen) throw new Error("La IA no devolvió resumen.");
    await context.supabase.from("freelance_resumenes").upsert({
      usuario_id: data.usuario_id, mes: data.mes, anio: data.anio, resumen, updated_at: new Date().toISOString(),
    });
    return { resumen };
  });

export const leerComprobanteGratis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { imagenBase64: string }) => {
    if (!d?.imagenBase64?.startsWith("data:")) throw new Error("Imagen inválida");
    return d;
  })
  .handler(async ({ data, context }) => {
    await verificarPagos(context.supabase as never, context.userId);
    const [meta, b64] = data.imagenBase64.split(",");
    const mime = meta.slice(5).split(";")[0];
    const texto = await gemini([
      { text: "Lee este comprobante de pago de Ecuador. Devuelve SOLO JSON con: monto (número), fecha (YYYY-MM-DD), numero_comprobante, banco, referencia, tipo_pago (transferencia|deposito|cheque|otro). Usa null si falta." },
      { inline_data: { mime_type: mime, data: b64 } },
    ]);
    const s = texto.replace(/```json|```/g, "");
    try {
      const p = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const n = Number(String(p["monto"] ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
      return {
        monto: Number.isFinite(n) && n > 0 ? n : null, fecha: str(p["fecha"]), numero_comprobante: str(p["numero_comprobante"]),
        banco: str(p["banco"]), referencia: str(p["referencia"]), tipo_pago: str(p["tipo_pago"]),
      };
    } catch {
      return { monto: null, fecha: null, numero_comprobante: null, banco: null, referencia: null, tipo_pago: null };
    }
  });
