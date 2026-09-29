import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const inputSchema = z.object({
  alumna_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duracion_min: z.number().int().min(1).max(60),
  motivo: z.string().max(300).optional(),
});

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

function sumarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  if (total >= 24 * 60) throw new Error("La sesión no puede terminar al día siguiente.");
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

export const registrarSesion1a1Historica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error(rolesError.message);

    const esStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "soporte");
    if (!esStaff) throw new Error("No autorizado para registrar sesiones históricas.");
    if (data.alumna_id === context.userId) throw new Error("Selecciona una alumna válida.");

    const [{ data: alumna, error: alumnaError }, { data: rolesAlumna, error: rolesAlumnaError }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,estado").eq("id", data.alumna_id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.alumna_id),
    ]);
    if (alumnaError) throw new Error(alumnaError.message);
    if (rolesAlumnaError) throw new Error(rolesAlumnaError.message);
    if (!alumna || alumna.estado !== "activo") throw new Error("La alumna seleccionada no está activa.");
    if ((rolesAlumna ?? []).some((r) => r.role === "admin" || r.role === "soporte")) {
      throw new Error("Selecciona una alumna, no una cuenta del equipo.");
    }

    const hoy = fechaHoyEcuador();
    if (data.fecha > hoy || data.fecha < "2025-01-01") {
      throw new Error("Solo puedes registrar sesiones que ya ocurrieron dentro del período disponible del sistema.");
    }

    const inicio = new Date(`${data.fecha}T${data.hora_inicio}:00-05:00`);
    const fin = new Date(inicio.getTime() + data.duracion_min * 60_000);
    if (!Number.isFinite(inicio.getTime()) || fin.getTime() > Date.now()) {
      throw new Error("La sesión indicada todavía no ha terminado.");
    }

    const horaFin = sumarMinutos(data.hora_inicio, data.duracion_min);
    const motivo = data.motivo?.trim() || "Registro histórico manual realizado por el profesor.";

    const { data: sesion, error: insertError } = await supabaseAdmin
      .from("sesiones_1a1")
      .insert({
        profesor_id: context.userId,
        alumna_id: data.alumna_id,
        fecha: data.fecha,
        hora_inicio: `${data.hora_inicio}:00`,
        hora_fin: horaFin,
        estado: "confirmada",
        motivo,
        recordatorio_enviado: true,
        zoom_link: null,
        zoom_meeting_id: null,
      })
      .select("id")
      .single();
    if (insertError || !sesion) throw new Error(insertError?.message || "No se pudo crear la sesión histórica.");

    try {
      const { error: duracionError } = await context.supabase.rpc("registrar_duracion_sesion", {
        _sesion_id: sesion.id,
        _duracion_min: data.duracion_min,
        _hora_inicio: `${data.hora_inicio}:00`,
      });
      if (duracionError) throw new Error(duracionError.message);

      // Es un registro histórico, no una reserva nueva futura. Conservamos la
      // notificación de finalización/calificación, pero retiramos la de reserva nueva.
      await supabaseAdmin
        .from("notificaciones")
        .delete()
        .eq("referencia_id", sesion.id)
        .eq("tipo", "sesion_nueva");

      return { id: sesion.id };
    } catch (error) {
      // Si la lógica oficial de duración falla, no dejamos una sesión huérfana.
      await supabaseAdmin.from("notificaciones").delete().eq("referencia_id", sesion.id);
      await supabaseAdmin.from("sesiones_1a1").delete().eq("id", sesion.id);
      throw error;
    }
  });
