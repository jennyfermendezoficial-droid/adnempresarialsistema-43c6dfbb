import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const COACH_DESCRIPCION = "Coach · Registro laboral ADN Empresarial";

const periodoSchema = z.object({
  mes: z.number().int().min(1).max(12),
  anio: z.number().int().min(2025).max(2100),
});

const registrarSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duracion_min: z.number().int().min(1).max(480),
  tema: z.string().trim().min(3).max(220),
});

function rangoMes(mes: number, anio: number) {
  const ultimo = new Date(anio, mes, 0).getDate();
  return {
    inicio: `${anio}-${String(mes).padStart(2, "0")}-01`,
    fin: `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`,
  };
}

function fechaHoyEcuador() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

async function exigirEquipo(client: typeof supabaseAdmin, userId: string) {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "soporte"]);
  if (error) throw new Error(error.message);
  if (!(data ?? []).length) throw new Error("No autorizado para registrar o consultar sesiones Coach.");
}

export type CoachRegistro = {
  id: string;
  profesor_id: string;
  fecha: string;
  hora_inicio: string;
  duracion_min: number;
  tema: string;
};

export const registrarCoachHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => registrarSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEquipo(supabaseAdmin, context.userId);

    const hoy = fechaHoyEcuador();
    if (data.fecha > hoy) throw new Error("No puedes registrar una sesión Coach futura.");
    if (data.fecha < "2025-01-01") throw new Error("La fecha indicada está fuera del período disponible del sistema.");

    const [h, m] = data.hora_inicio.split(":").map(Number);
    if (h * 60 + m + data.duracion_min >= 24 * 60) {
      throw new Error("La sesión Coach no puede terminar al día siguiente.");
    }

    const inicio = new Date(`${data.fecha}T${data.hora_inicio}:00-05:00`);
    const fin = new Date(inicio.getTime() + data.duracion_min * 60_000);
    if (!Number.isFinite(inicio.getTime()) || fin.getTime() > Date.now()) {
      throw new Error("La sesión Coach indicada todavía no ha terminado.");
    }

    const { data: duplicado, error: duplicadoError } = await supabaseAdmin
      .from("ae_actividades")
      .select("id")
      .eq("usuario_id", context.userId)
      .eq("fecha", data.fecha)
      .eq("hora_inicio", data.hora_inicio)
      .eq("descripcion", COACH_DESCRIPCION)
      .limit(1);
    if (duplicadoError) throw new Error(duplicadoError.message);
    if ((duplicado ?? []).length) throw new Error("Ya existe una sesión Coach registrada en esa fecha y hora.");

    const { data: creado, error } = await supabaseAdmin
      .from("ae_actividades")
      .insert({
        usuario_id: context.userId,
        titulo: data.tema.trim(),
        descripcion: COACH_DESCRIPCION,
        fecha: data.fecha,
        hora_inicio: data.hora_inicio,
        duracion_min: data.duracion_min,
        color: "#7C6BFF",
        link: null,
        recurrencia: null,
        recurrencia_hasta: null,
        recordatorios: null,
      })
      .select("id,usuario_id,fecha,hora_inicio,duracion_min,titulo")
      .single();
    if (error || !creado) throw new Error(error?.message || "No se pudo registrar la sesión Coach.");

    return {
      id: creado.id,
      profesor_id: creado.usuario_id,
      fecha: creado.fecha,
      hora_inicio: creado.hora_inicio,
      duracion_min: Number(creado.duracion_min),
      tema: creado.titulo,
    } satisfies CoachRegistro;
  });

export const listarCoachPropio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodoSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEquipo(supabaseAdmin, context.userId);
    const { inicio, fin } = rangoMes(data.mes, data.anio);
    const { data: rows, error } = await supabaseAdmin
      .from("ae_actividades")
      .select("id,usuario_id,fecha,hora_inicio,duracion_min,titulo")
      .eq("usuario_id", context.userId)
      .eq("descripcion", COACH_DESCRIPCION)
      .gte("fecha", inicio)
      .lte("fecha", fin)
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      profesor_id: r.usuario_id,
      fecha: r.fecha,
      hora_inicio: r.hora_inicio,
      duracion_min: Number(r.duracion_min),
      tema: r.titulo,
    })) satisfies CoachRegistro[];
  });

export const listarCoachPagos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodoSchema.parse(data))
  .handler(async ({ data, context }) => {
    await exigirEquipo(supabaseAdmin, context.userId);
    const { inicio, fin } = rangoMes(data.mes, data.anio);
    const { data: rows, error } = await supabaseAdmin
      .from("ae_actividades")
      .select("id,usuario_id,fecha,hora_inicio,duracion_min,titulo")
      .eq("descripcion", COACH_DESCRIPCION)
      .gte("fecha", inicio)
      .lte("fecha", fin)
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      profesor_id: r.usuario_id,
      fecha: r.fecha,
      hora_inicio: r.hora_inicio,
      duracion_min: Number(r.duracion_min),
      tema: r.titulo,
    })) satisfies CoachRegistro[];
  });
