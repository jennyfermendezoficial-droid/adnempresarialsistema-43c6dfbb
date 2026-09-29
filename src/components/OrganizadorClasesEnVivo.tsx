import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface Modulo {
  id: string;
  nombre: string;
  orden: number;
}

interface Leccion {
  id: string;
  modulo_id: string;
  nombre: string;
  bunny_video_id: string | null;
  orden: number;
}

export function OrganizadorClasesEnVivo({ cursoId }: { cursoId: string }) {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [lecciones, setLecciones] = useState<Leccion[]>([]);
  const [destinos, setDestinos] = useState<Record<string, string>>({});

  const cargar = async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      const { data: mods, error: modError } = await supabase
        .from("modulos_curso")
        .select("id,nombre,orden")
        .eq("curso_id", cursoId)
        .order("orden");
      if (modError) throw modError;

      const listaMods = (mods ?? []) as Modulo[];
      setModulos(listaMods);

      if (!listaMods.length) {
        setLecciones([]);
        return;
      }

      const { data: lecs, error: lecError } = await supabase
        .from("lecciones")
        .select("id,modulo_id,nombre,bunny_video_id,orden")
        .in("modulo_id", listaMods.map((m) => m.id))
        .order("orden");
      if (lecError) throw lecError;

      const listaLecs = (lecs ?? []) as Leccion[];
      setLecciones(listaLecs);
      setDestinos(Object.fromEntries(listaLecs.map((l) => [l.id, l.modulo_id])));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron cargar las clases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void cargar();
  }, [open, cursoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombreModulo = useMemo(
    () => new Map(modulos.map((m) => [m.id, m.nombre])),
    [modulos],
  );

  const mover = async (leccion: Leccion) => {
    if (!isStaff) return;
    const destino = destinos[leccion.id];
    if (!destino || destino === leccion.modulo_id) {
      return toast.info("Selecciona un módulo diferente para mover esta clase.");
    }

    setMovingId(leccion.id);
    try {
      const { error } = await supabase
        .from("lecciones")
        .update({ modulo_id: destino })
        .eq("id", leccion.id);
      if (error) throw error;

      setLecciones((actuales) =>
        actuales.map((l) => (l.id === leccion.id ? { ...l, modulo_id: destino } : l)),
      );
      toast.success(`Clase movida a ${nombreModulo.get(destino) || "otro módulo"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo mover la clase");
    } finally {
      setMovingId(null);
    }
  };

  if (!isStaff) return null;

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 pt-5 flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card text-sm font-semibold hover:bg-muted"
        >
          <ArrowRightLeft className="w-4 h-4" /> Organizar clases
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold text-lg">Organizar clases</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Mueve una clase existente a otro módulo sin volver a subir el video.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(90vh-82px)]">
              {loading ? (
                <div className="py-14 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando clases existentes…
                </div>
              ) : modulos.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                  Primero crea un módulo. Después podrás trasladar las clases a ese módulo.
                </div>
              ) : lecciones.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                  No se encontraron clases vinculadas a los módulos de esta biblioteca.
                </div>
              ) : (
                <div className="space-y-3">
                  {lecciones.map((leccion) => (
                    <div key={leccion.id} className="rounded-xl border p-4 bg-background/40">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{leccion.nombre}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Módulo actual: <span className="font-medium text-foreground">{nombreModulo.get(leccion.modulo_id) || "Sin nombre"}</span>
                            {leccion.bunny_video_id ? " · Video enlazado" : " · Sin video enlazado"}
                          </div>
                        </div>

                        <select
                          value={destinos[leccion.id] ?? leccion.modulo_id}
                          onChange={(e) => setDestinos((d) => ({ ...d, [leccion.id]: e.target.value }))}
                          className="min-w-[220px] px-3 py-2 rounded-lg border bg-background text-sm"
                        >
                          {modulos.map((modulo) => (
                            <option key={modulo.id} value={modulo.id}>{modulo.nombre}</option>
                          ))}
                        </select>

                        <button
                          onClick={() => void mover(leccion)}
                          disabled={movingId === leccion.id || (destinos[leccion.id] ?? leccion.modulo_id) === leccion.modulo_id}
                          className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
                        >
                          {movingId === leccion.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                          Mover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
