import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DatosComprobante {
  monto: number | null;
  fecha: string | null;              // YYYY-MM-DD
  numero_comprobante: string | null;
  banco: string | null;
  tipo_pago: string | null;          // transferencia | efectivo | cheque | deposito | otro
  beneficiario: string | null;
  observacion: string | null;
}

const VACIO: DatosComprobante = {
  monto: null, fecha: null, numero_comprobante: null,
  banco: null, tipo_pago: null, beneficiario: null, observacion: null,
};

export const leerComprobante = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imagenBase64: string }) => {
    if (!input?.imagenBase64?.startsWith("data:")) throw new Error("Imagen inválida");
    return input;
  })
  .handler(async ({ data }): Promise<DatosComprobante> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Falta la configuración de IA");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "Eres un lector de comprobantes de pago de Ecuador. Devuelve SOLO un JSON con las claves " +
              "monto (número), fecha (YYYY-MM-DD), numero_comprobante (texto), banco (texto), " +
              "tipo_pago (transferencia|efectivo|cheque|deposito|otro), beneficiario (texto), observacion (texto). " +
              "Usa null cuando un dato no aparezca. No agregues explicaciones ni markdown.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrae los datos de este comprobante de pago." },
              { type: "image_url", image_url: { url: data.imagenBase64 } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Demasiadas lecturas seguidas, intenta en un momento");
    if (res.status === 402) throw new Error("Se agotaron los créditos de IA del espacio de trabajo");
    if (!res.ok) throw new Error("No se pudo leer el comprobante");

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const texto = json.choices?.[0]?.message?.content ?? "";
    const limpio = texto.replace(/```json|```/g, "").trim();
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio < 0 || fin < 0) return VACIO;

    try {
      const parsed = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
      const num = (v: unknown) => {
        const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        monto: num(parsed["monto"]),
        fecha: str(parsed["fecha"]),
        numero_comprobante: str(parsed["numero_comprobante"]),
        banco: str(parsed["banco"]),
        tipo_pago: str(parsed["tipo_pago"]),
        beneficiario: str(parsed["beneficiario"]),
        observacion: str(parsed["observacion"]),
      };
    } catch {
      return VACIO;
    }
  });
