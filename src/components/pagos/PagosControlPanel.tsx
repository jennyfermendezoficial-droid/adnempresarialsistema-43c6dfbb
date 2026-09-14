// Panel superior de Pagos: conserva la calificación del equipo para Profesores
// y añade el selector entre la gestión de Profesores y Alumnas.
import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";
import { formatNombre } from "@/lib/nombres";
import { formatHM } from "@/lib/tiempo";

interface ProfesorBasico {
  id: string;
  nombre_completo: string | null;
  email?: string | null;
}

interface CalificacionEquipo {
  profesor_id: string;
  profesor: string;
  promedio: number;
  cantidad: number;
}

interface HorarioProfesor {
  profesor_id: string;
  profesor: string;
  clasesLaboral: number;
  clasesFuera: number;
  sesionesLaboral: number;
  sesionesFuera: number;
}

function mesAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { mes: d.getMonth() + 1, anio: d.getFullYear() };
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const JORNADAS_LABORALES: Array<[number, number]> = [
  [7 * 60, 13 * 60],
  [14 * 60 + 30, 17 * 60 + 30],
];

function minutosDesdeHora(hora: string) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function dividirHorario(horaInicio: string, duracionMin: number) {
  const duracion = Math.max(0, Number(duracionMin) || 0);
  if (!duracion) return { laboral: 0, fuera: 0 };

  const inicio = minutosDesdeHora(horaInicio);
  const fin = inicio + duracion;
  let laboral = 0;

  // Se contemplan dos días por seguridad si una actividad cruza medianoche.
  for (const offset of [0, 24 * 60]) {
    for (const [desde, hasta] of JORNADAS_LABORALES) {
      const solape = Math.max(
        0,
        Math.min(fin, hasta + offset) - Math.max(inicio, desde + offset),
      );
      laboral += solape;
    }
  }

  laboral = Math.min(duracion, laboral);
  return { laboral, fuera: Math.max(0, duracion - laboral) };
}

function rangoMes(mes: number, anio: number) {
  const ultimo = new Date(anio, mes, 0).getDate();
  return {
    inicio: `${anio}-${String(mes).padStart(2, "0")}-01`,
    fin: `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`,
  };
}

function periodosDisponibles() {
  const hoy = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return {
      mes: d.getMonth() + 1,
      anio: d.getFullYear(),
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
    };
  });
}

export function PagosControlPanel() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const enAlumnas = pathname.startsWith("/pagos/alumnas");
  const [calificaciones, setCalificaciones] = useState<CalificacionEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const periodoCalif = useMemo(mesAnterior, []);
  const periodos = useMemo(periodosDisponibles, []);
  const ahora = useMemo(() => new Date(), []);
  const [mesHorario, setMesHorario] = useState(ahora.getMonth() + 1);
  const [anioHorario, setAnioHorario] = useState(ahora.getFullYear());
  const [horarios, setHorarios] = useState<HorarioProfesor[]>([]);
  const [loadingHorario, setLoadingHorario] = useState(true);
  const [errorHorario, setErrorHorario] = useState<string | null>(null);

  useEffect(() => {
    if (!puedeGestionar || enAlumnas) {
      setLoading(false);
      return;
    }

    let activo = true;

    const cargar = async () => {
      setLoading(true);
      try {
        const [{ data: profesoresData }, { data: califsData }] = await Promise.all([
          supabase.rpc("listar_profesores"),
          supabase
            .from("calificaciones_mensuales")
            .select("profesor_id,claridad,didactica,practico,desenvolvimiento")
            .eq("mes", periodoCalif.mes)
            .eq("anio", periodoCalif.anio),
        ]);

        if (!activo) return;

        const profesores = ((profesoresData ?? []) as ProfesorBasico[]).filter(
          (p, index, arr) => arr.findIndex((x) => x.id === p.id) === index,
        );

        const porProfesor = new Map<string, { suma: number; valores: number; filas: number }>();
        ((califsData ?? []) as Array<{
          profesor_id: string;
          claridad: number | null;
          didactica: number | null;
          practico: number | null;
          desenvolvimiento: number | null;
        }>).forEach((c) => {
          const actual = porProfesor.get(c.profesor_id) ?? { suma: 0, valores: 0, filas: 0 };
          [c.claridad, c.didactica, c.practico, c.desenvolvimiento].forEach((valor) => {
            if (typeof valor === "number") {
              actual.suma += valor;
              actual.valores += 1;
            }
          });
          actual.filas += 1;
          porProfesor.set(c.profesor_id, actual);
        });

        setCalificaciones(
          profesores
            .map((p) => {
              const c = porProfesor.get(p.id);
              return {
                profesor_id: p.id,
                profesor: formatNombre(p.nombre_completo) || p.email || "Profesor",
                promedio: c && c.valores ? c.suma / c.valores : 0,
                cantidad: c?.filas ?? 0,
              };
            })
            .sort((a, b) => a.profesor.localeCompare(b.profesor, "es")),
        );
      } finally {
        if (activo) setLoading(false);
      }
    };

    void cargar();
    const refrescar = () => void cargar();
    window.addEventListener("focus", refrescar);
    return () => {
      activo = false;
      window.removeEventListener("focus", refrescar);
    };
  }, [puedeGestionar, enAlumnas, periodoCalif.mes, periodoCalif.anio]);

  useEffect(() => {
    if (!puedeGestionar || enAlumnas) {
      setHorarios([]);
      setLoadingHorario(false);
      return;
    }

    let activo = true;
    const cargarHorario = async () => {
      setLoadingHorario(true);
      setErrorHorario(null);
      try {
        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id,role")
          .eq("role", "soporte");
        if (rolesError) throw rolesError;

        const profesorIds = Array.from(new Set(
          ((rolesData ?? []) as Array<{ user_id: string; role: string }>).map((r) => r.user_id),
        ));

        if (!profesorIds.length) {
          if (activo) setHorarios([]);
          return;
        }

        const { inicio, fin } = rangoMes(mesHorario, anioHorario);
        const [{ data: profesoresData }, clasesRes, sesionesRes] = await Promise.all([
          supabase.rpc("listar_profesores"),
          supabase
            .from("clases_en_vivo")
            .select("profesor_id,hora_inicio,duracion_min")
            .in("profesor_id", profesorIds)
            .gte("fecha", inicio)
            .lte("fecha", fin),
          supabase
            .from("sesiones_1a1")
            .select("profesor_id,hora_inicio,duracion_min,estado")
            .in("profesor_id", profesorIds)
            .gte("fecha", inicio)
            .lte("fecha", fin),
        ]);

        if (clasesRes.error) throw clasesRes.error;
        if (sesionesRes.error) throw sesionesRes.error;
        if (!activo) return;

        const nombres = new Map<string, string>();
        ((profesoresData ?? []) as ProfesorBasico[]).forEach((p) => {
          nombres.set(p.id, formatNombre(p.nombre_completo) || p.email || "Profesor");
        });

        const acumulado = new Map<string, HorarioProfesor>();
        profesorIds.forEach((id) => acumulado.set(id, {
          profesor_id: id,
          profesor: nombres.get(id) || "Profesor",
          clasesLaboral: 0,
          clasesFuera: 0,
          sesionesLaboral: 0,
          sesionesFuera: 0,
        }));

        ((clasesRes.data ?? []) as Array<{
          profesor_id: string;
          hora_inicio: string;
          duracion_min: number | null;
        }>).forEach((clase) => {
          const min = Number(clase.duracion_min ?? 0);
          if (min <= 0) return;
          const division = dividirHorario(clase.hora_inicio, min);
          const fila = acumulado.get(clase.profesor_id);
          if (!fila) return;
          fila.clasesLaboral += division.laboral;
          fila.clasesFuera += division.fuera;
        });

        ((sesionesRes.data ?? []) as Array<{
          profesor_id: string;
          hora_inicio: string;
          duracion_min: number | null;
          estado: string | null;
        }>).forEach((sesion) => {
          const min = Number(sesion.duracion_min ?? 0);
          const estado = (sesion.estado || "").toLowerCase();
          if (min <= 0 || ["cancelada", "cancelado", "anulada", "anulado", "no_realizada", "no realizado"].includes(estado)) return;
          const division = dividirHorario(sesion.hora_inicio, min);
          const fila = acumulado.get(sesion.profesor_id);
          if (!fila) return;
          fila.sesionesLaboral += division.laboral;
          fila.sesionesFuera += division.fuera;
        });

        setHorarios(
          Array.from(acumulado.values()).sort((a, b) => a.profesor.localeCompare(b.profesor, "es")),
        );
      } catch (error) {
        if (!activo) return;
        setHorarios([]);
        setErrorHorario(error instanceof Error ? error.message : "No se pudo calcular el horario laboral.");
      } finally {
        if (activo) setLoadingHorario(false);
      }
    };

    void cargarHorario();
    const refrescar = () => void cargarHorario();
    window.addEventListener("adn:horas-actualizadas", refrescar);
    window.addEventListener("adn:clase-historica-registrada", refrescar);
    return () => {
      activo = false;
      window.removeEventListener("adn:horas-actualizadas", refrescar);
      window.removeEventListener("adn:clase-historica-registrada", refrescar);
    };
  }, [puedeGestionar, enAlumnas, mesHorario, anioHorario]);

  const totalesHorario = useMemo(() => horarios.reduce(
    (acc, fila) => ({
      clasesLaboral: acc.clasesLaboral + fila.clasesLaboral,
      clasesFuera: acc.clasesFuera + fila.clasesFuera,
      sesionesLaboral: acc.sesionesLaboral + fila.sesionesLaboral,
      sesionesFuera: acc.sesionesFuera + fila.sesionesFuera,
    }),
    { clasesLaboral: 0, clasesFuera: 0, sesionesLaboral: 0, sesionesFuera: 0 },
  ), [horarios]);

  if (!puedeGestionar) return null;

  return (
    <div className="p-4 md:px-6 md:pt-6 md:pb-0 max-w-7xl mx-auto">
      <div className="flex justify-end mb-3">
        <div className="inline-flex items-center gap-1 rounded-xl border bg-card p-1">
          <Link
            to="/pagos"
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${!enAlumnas ? "bg-violet-gradient text-white shadow-sm" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            Profesores
          </Link>
          <Link
            to="/pagos/alumnas"
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${enAlumnas ? "bg-violet-gradient text-white shadow-sm" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            Alumnas
          </Link>
        </div>
      </div>

      {!enAlumnas && (
        <>
          <section className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold">
                  Calificación del equipo · {MESES[periodoCalif.mes - 1]} {periodoCalif.anio}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Cierre del mes anterior. Se muestran todos los profesores, incluso quienes todavía no recibieron una calificación.
              </p>
            </div>

            {loading ? (
              <div className="py-8 text-center text-muted-foreground">Cargando calificaciones…</div>
            ) : calificaciones.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No hay profesores disponibles para este resumen.</div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                {calificaciones.map((c) => (
                  <div key={c.profesor_id} className="rounded-xl border p-4">
                    <div className="font-semibold text-sm">{c.profesor}</div>
                    {c.cantidad > 0 ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="text-xl font-bold tabular-nums">{c.promedio.toFixed(2)}</div>
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-xs text-muted-foreground">
                          {c.cantidad} evaluación{c.cantidad === 1 ? "" : "es"}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">Sin calificaciones registradas</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-card overflow-hidden mt-4">
            <div className="px-5 py-4 border-b flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Distribución por horario laboral</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Horario laboral: 07:00–13:00 y 14:30–17:30. Si una actividad cruza un límite, el tiempo se divide minuto a minuto.
                </p>
              </div>
              <select
                value={`${anioHorario}-${mesHorario}`}
                onChange={(e) => {
                  const [a, m] = e.target.value.split("-").map(Number);
                  setAnioHorario(a);
                  setMesHorario(m);
                }}
                className="px-3 py-2 rounded-lg border bg-background text-sm font-medium"
              >
                {periodos.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            {loadingHorario ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Calculando distribución de horas…</div>
            ) : errorHorario ? (
              <div className="p-5 text-sm text-red-600">{errorHorario}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                      <th className="text-left px-4 py-3 font-semibold">Profesor</th>
                      <th className="text-right px-3 py-3 font-semibold">Clases · laboral</th>
                      <th className="text-right px-3 py-3 font-semibold">Clases · fuera</th>
                      <th className="text-right px-3 py-3 font-semibold">1 a 1 · laboral</th>
                      <th className="text-right px-3 py-3 font-semibold">1 a 1 · fuera</th>
                      <th className="text-right px-4 py-3 font-semibold">Total dictado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horarios.map((fila) => {
                      const total = fila.clasesLaboral + fila.clasesFuera + fila.sesionesLaboral + fila.sesionesFuera;
                      return (
                        <tr key={fila.profesor_id} className="border-t">
                          <td className="px-4 py-3 font-semibold">{fila.profesor}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatHM(fila.clasesLaboral)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatHM(fila.clasesFuera)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatHM(fila.sesionesLaboral)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatHM(fila.sesionesFuera)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">{formatHM(total)}</td>
                        </tr>
                      );
                    })}
                    {horarios.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No hay actividad registrada en este período.</td></tr>
                    )}
                    {horarios.length > 0 && (
                      <tr className="border-t bg-muted/40 font-semibold">
                        <td className="px-4 py-3">Total equipo</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatHM(totalesHorario.clasesLaboral)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatHM(totalesHorario.clasesFuera)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatHM(totalesHorario.sesionesLaboral)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatHM(totalesHorario.sesionesFuera)}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {formatHM(
                            totalesHorario.clasesLaboral +
                            totalesHorario.clasesFuera +
                            totalesHorario.sesionesLaboral +
                            totalesHorario.sesionesFuera,
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
