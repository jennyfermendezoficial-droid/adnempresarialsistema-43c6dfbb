import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CALIFICACION_EQUIPO_MES = 8;
export const CALIFICACION_EQUIPO_ANIO = 2026;

// Todo lo que existía antes de esta rama se considera calificación heredada.
// Karen debe volver a calificarse con el nuevo flujo obligatorio y con motivo.
const CORTE_KAREN_LEGACY = "2026-09-15T21:14:18.000Z";

const guardarSchema = z.object({
  profesor_id: z.string().uuid(),
  estrellas: z.number().int().min(0).max(5),
  razon: z.string().trim().min(3).max(500),
});

type PerfilEquipo = {
  id: string;
  nombre_completo: string | null;
  email: string | null;
  estado: string | null;
};

type CalifRow = {
  id: string;
  profesor_id: string;
  claridad: number | null;
  didactica: number | null;
  desenvolvimiento: number | null;
  practico: number | null;
  comentario: string | null;
  created_at: string;
};

function nombreVisible(p: PerfilEquipo) {
  return (p.nombre_completo || p.email || "Profesor").trim();
}

function promedioFila(c: CalifRow) {
  const valores = [c.claridad, c.didactica, c.desenvolvimiento, c.practico]
    .filter((v): v is number => typeof v === "number");
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

function filaCompleta(c: CalifRow) {
  return promedioFila(c) !== null && (c.comentario || "").trim().length >= 3;
}

async function rolesDe(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.role));
}

async function equipoActivo(): Promise<PerfilEquipo[]> {
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id,role")
    .in("role", ["admin", "soporte"]);
  if (rolesError) throw new Error(rolesError.message);

  const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
  if (!ids.length) return [];

  const { data: perfiles, error: perfilesError } = await supabaseAdmin
    .from("profiles")
    .select("id,nombre_completo,email,estado")
    .in("id", ids);
  if (perfilesError) throw new Error(perfilesError.message);

  return ((perfiles ?? []) as PerfilEquipo[])
    .filter((p) => !p.estado || p.estado === "activo")
    .sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), "es"));
}

async function limpiarKarenLegacy(equipo?: PerfilEquipo[]) {
  const lista = equipo ?? await equipoActivo();
  const karenIds = lista
    .filter((p) => nombreVisible(p).toLocaleLowerCase("es").includes("karen"))
    .map((p) => p.id);
  if (!karenIds.length) return;

  const { error } = await supabaseAdmin
    .from("calificaciones_mensuales")
    .delete()
    .eq("mes", CALIFICACION_EQUIPO_MES)
    .eq("anio", CALIFICACION_EQUIPO_ANIO)
    .in("profesor_id", karenIds)
    .lt("created_at", CORTE_KAREN_LEGACY);
  if (error) throw new Error(error.message);
}

export type ProfesorCalificacionPendiente = {
  id: string;
  nombre: string;
  completada: boolean;
  estrellas: number | null;
  razon: string;
};

export const estadoCalificacionEquipo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const equipo = await equipoActivo();
    await limpiarKarenLegacy(equipo);

    const roles = await rolesDe(context.userId);
    const esEquipo = roles.has("admin") || roles.has("soporte");
    const esEstudiante = roles.has("usuario") && !esEquipo;
    if (!esEstudiante) {
      return {
        requerido: false,
        mes: CALIFICACION_EQUIPO_MES,
        anio: CALIFICACION_EQUIPO_ANIO,
        profesores: [] as ProfesorCalificacionPendiente[],
      };
    }

    const { data: califs, error } = await supabaseAdmin
      .from("calificaciones_mensuales")
      .select("id,profesor_id,claridad,didactica,desenvolvimiento,practico,comentario,created_at")
      .eq("alumna_id", context.userId)
      .eq("mes", CALIFICACION_EQUIPO_MES)
      .eq("anio", CALIFICACION_EQUIPO_ANIO)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const porProfesor = new Map<string, CalifRow>();
    ((califs ?? []) as CalifRow[]).forEach((c) => {
      if (!porProfesor.has(c.profesor_id)) porProfesor.set(c.profesor_id, c);
    });

    const profesores = equipo.map((p) => {
      const c = porProfesor.get(p.id);
      const promedio = c ? promedioFila(c) : null;
      return {
        id: p.id,
        nombre: nombreVisible(p),
        completada: !!c && filaCompleta(c),
        estrellas: promedio === null ? null : Math.round(promedio * 100) / 100,
        razon: c?.comentario?.trim() || "",
      } satisfies ProfesorCalificacionPendiente;
    });

    return {
      requerido: profesores.some((p) => !p.completada),
      mes: CALIFICACION_EQUIPO_MES,
      anio: CALIFICACION_EQUIPO_ANIO,
      profesores,
    };
  });

export const guardarCalificacionEquipo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => guardarSchema.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await rolesDe(context.userId);
    if (!roles.has("usuario") || roles.has("admin") || roles.has("soporte")) {
      throw new Error("Solo una estudiante puede enviar esta calificación.");
    }

    const equipo = await equipoActivo();
    const profesor = equipo.find((p) => p.id === data.profesor_id);
    if (!profesor) throw new Error("El profesor seleccionado no pertenece al equipo activo.");

    const { data: existentes, error: existentesError } = await supabaseAdmin
      .from("calificaciones_mensuales")
      .select("id")
      .eq("alumna_id", context.userId)
      .eq("profesor_id", data.profesor_id)
      .eq("mes", CALIFICACION_EQUIPO_MES)
      .eq("anio", CALIFICACION_EQUIPO_ANIO)
      .order("created_at", { ascending: false })
      .limit(1);
    if (existentesError) throw new Error(existentesError.message);

    const payload = {
      claridad: data.estrellas,
      didactica: data.estrellas,
      desenvolvimiento: data.estrellas,
      practico: data.estrellas,
      comentario: data.razon.trim(),
    };

    if ((existentes ?? []).length) {
      const { error } = await supabaseAdmin
        .from("calificaciones_mensuales")
        .update(payload)
        .eq("id", existentes![0].id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("calificaciones_mensuales").insert({
        alumna_id: context.userId,
        profesor_id: data.profesor_id,
        mes: CALIFICACION_EQUIPO_MES,
        anio: CALIFICACION_EQUIPO_ANIO,
        ...payload,
      });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const resumenCalificacionesEquipo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesDe(context.userId);
    if (!roles.has("admin") && !roles.has("soporte")) {
      throw new Error("No autorizado para consultar la calificación del equipo.");
    }

    const equipo = await equipoActivo();
    await limpiarKarenLegacy(equipo);
    const ids = equipo.map((p) => p.id);
    if (!ids.length) return [];

    const { data: califs, error } = await supabaseAdmin
      .from("calificaciones_mensuales")
      .select("id,profesor_id,claridad,didactica,desenvolvimiento,practico,comentario,created_at")
      .in("profesor_id", ids)
      .eq("mes", CALIFICACION_EQUIPO_MES)
      .eq("anio", CALIFICACION_EQUIPO_ANIO);
    if (error) throw new Error(error.message);

    const filas = (califs ?? []) as CalifRow[];
    return equipo.map((p) => {
      const validas = filas.filter((c) => c.profesor_id === p.id && filaCompleta(c));
      const valores = validas.map(promedioFila).filter((v): v is number => v !== null);
      return {
        profesor_id: p.id,
        profesor: nombreVisible(p),
        promedio: valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0,
        cantidad: validas.length,
      };
    });
  });
