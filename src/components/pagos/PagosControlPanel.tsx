// Panel superior de Pagos: solo conserva la calificación del equipo; alertas y cuentas se muestran en sus secciones correspondientes.
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";
import { formatNombre } from "@/lib/nombres";

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

export function PagosControlPanel() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const [calificaciones, setCalificaciones] = useState<CalificacionEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const periodoCalif = useMemo(mesAnterior, []);

  useEffect(() => {
    if (!puedeGestionar) {
      setLoading(false);
      return;
    }

    let activo = true;

    const cargar = async () => {
      setLoading(true);
      try {
        const [{ data: profesoresData }, { data: califsData }] = await Promise.all([
          (supabase.rpc as unknown as (
            fn: string,
          ) => Promise<{ data: ProfesorBasico[] | null }>)("listar_profesores"),
          supabase
            .from("calificaciones_mensuales")
            .select("profesor_id,claridad,didactica,practico,desenvolvimiento")
            .eq("mes", periodoCalif.mes)
            .eq("anio", periodoCalif.anio),
        ]);

        if (!activo) return;

        const profesores = (profesoresData ?? []).filter(
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
  }, [puedeGestionar, periodoCalif.mes, periodoCalif.anio]);

  if (!puedeGestionar) return null;

  return (
    <div className="p-4 md:px-6 md:pt-6 md:pb-0 max-w-7xl mx-auto">
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
    </div>
  );
}
