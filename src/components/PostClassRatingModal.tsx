import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  estadoCalificacionEquipo,
  guardarCalificacionEquipo,
  type ProfesorCalificacionPendiente,
} from "@/lib/team-ratings.functions";

interface EstadoEquipo {
  requerido: boolean;
  mes: number;
  anio: number;
  profesores: ProfesorCalificacionPendiente[];
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function PostClassRatingModal() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const consultar = useServerFn(estadoCalificacionEquipo);
  const guardar = useServerFn(guardarCalificacionEquipo);
  const [estado, setEstado] = useState<EstadoEquipo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estrellas, setEstrellas] = useState<number | null>(null);
  const [razon, setRazon] = useState("");

  const cargar = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const data = await consultar();
      setEstado(data as EstadoEquipo);
    } catch (error) {
      console.error("No se pudo consultar la calificación mensual", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!uid) {
      setEstado(null);
      return;
    }
    void cargar();
    // Se vuelve a comprobar al regresar a la pestaña. Si quedó algo pendiente,
    // el formulario reaparece; no existe un skip permanente en localStorage.
    const onFocus = () => void cargar();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const pendientes = useMemo(
    () => estado?.profesores.filter((p) => !p.completada) ?? [],
    [estado],
  );
  const actual = pendientes[0] ?? null;
  const completados = (estado?.profesores.length ?? 0) - pendientes.length;
  const total = estado?.profesores.length ?? 0;

  useEffect(() => {
    if (!actual) {
      setEstrellas(null);
      setRazon("");
      return;
    }
    setEstrellas(actual.estrellas === null ? null : Math.max(0, Math.min(5, Math.round(actual.estrellas))));
    setRazon(actual.razon || "");
  }, [actual?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    if (!actual) return;
    if (estrellas === null) return toast.error("Selecciona una calificación de 0 a 5 estrellas.");
    if (razon.trim().length < 3) return toast.error("Escribe la razón de tu calificación.");

    setSaving(true);
    try {
      await guardar({
        data: {
          profesor_id: actual.id,
          estrellas,
          razon: razon.trim(),
        },
      });
      toast.success("Calificación guardada");
      setEstrellas(null);
      setRazon("");
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la calificación.");
    } finally {
      setSaving(false);
    }
  };

  // En cuentas del equipo la consulta sigue ejecutándose para aplicar la limpieza
  // de la calificación heredada de Karen, pero no se muestra el formulario.
  if (!estado?.requerido || !actual) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm grid place-items-center p-3 sm:p-4">
      <div className="w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl">
        <div className="p-5 sm:p-6 border-b">
          <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-violet">
            Calificación obligatoria · {MESES[(estado.mes || 1) - 1]} {estado.anio}
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold mt-1">Califica al equipo de profesores</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Debes completar el 100% de las evaluaciones. Cada profesor recibe una calificación de 0 a 5 y una razón obligatoria.
          </p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span>{completados} de {total} completados</span>
              <span className="font-semibold">{total ? Math.round((completados / total) * 100) : 100}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-violet-gradient transition-all"
                style={{ width: `${total ? (completados / total) * 100 : 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="rounded-xl border bg-muted/25 p-4 mb-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Profesor a evaluar</div>
            <div className="text-lg font-semibold mt-1">{actual.nombre}</div>
          </div>

          <div className="mb-5">
            <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              Calificación · 0 a 5
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEstrellas(0)}
                className={`h-10 px-3 rounded-lg border text-sm font-bold transition ${estrellas === 0 ? "bg-violet-gradient text-white border-transparent" : "bg-background"}`}
              >
                0
              </button>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEstrellas(n)}
                    className="p-1 rounded-md transition hover:scale-110 focus:outline-none"
                    aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
                  >
                    <Star
                      className={`w-8 h-8 ${estrellas !== null && n <= estrellas ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/35"}`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-sm font-semibold tabular-nums ml-1">
                {estrellas === null ? "Sin seleccionar" : `${estrellas}/5`}
              </span>
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              Razón de la calificación *
            </label>
            <textarea
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Explica brevemente por qué le das esta calificación…"
              className="mt-2 w-full px-3 py-2.5 rounded-xl border bg-background text-sm resize-none"
            />
            <div className="text-[11px] text-muted-foreground mt-1 text-right">{razon.length}/500</div>
          </div>

          <button
            type="button"
            onClick={() => void enviar()}
            disabled={saving || loading}
            className="w-full px-4 py-3 rounded-xl bg-violet-gradient text-white font-semibold text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {saving || loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {pendientes.length > 1 ? "Guardar y continuar" : "Guardar y finalizar"}
          </button>

          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Esta evaluación no se puede omitir definitivamente. Si sales antes de terminar, volverá a aparecer al entrar nuevamente.
          </p>
        </div>
      </div>
    </div>
  );
}
