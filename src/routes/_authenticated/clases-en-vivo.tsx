import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CheckCircle2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CursoDetalle } from "@/components/CursoDetalle";
import { GestionContenidosEquipo } from "@/components/GestionContenidosEquipo";

interface Curso {
  id: string;
  nombre: string;
  descripcion: string | null;
  color_cover: string | null;
  image_url: string | null;
  orden: number;
  solo_equipo?: boolean | null;
  parent_curso_id?: string | null;
}

export const Route = createFileRoute("/_authenticated/clases-en-vivo")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Clases en vivo · ADN Empresarial" },
      { name: "description", content: "Accede a las clases en vivo habilitadas para tu cuenta y continúa tu formación." },
      { property: "og:title", content: "Clases en vivo · ADN Empresarial" },
      { property: "og:description", content: "Biblioteca de clases en vivo con acceso por permisos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isStaff) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [{ data: cs }, { data: ps }] = await Promise.all([
        supabase
          .from("cursos")
          .select("*")
          .eq("tipo", "clase_en_vivo")
          .order("orden"),
        uid
          ? supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid)
          : Promise.resolve({ data: [] as { curso_id: string }[] }),
      ]);

      if (cancelled) return;
      const visibles = ((cs ?? []) as Curso[]).filter((c) => c.solo_equipo !== true && !c.parent_curso_id);
      setCursos(visibles);
      setPermisos(new Set(((ps ?? []) as { curso_id: string }[]).map((p) => p.curso_id)));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [uid, isStaff]);

  if (isStaff) return <GestionContenidosEquipo />;

  if (activeId) {
    return (
      <CursoDetalle
        cursoId={activeId}
        volver
        volverLabel="Volver a clases en vivo"
        onVolver={() => setActiveId(null)}
      />
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Clases en vivo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Accede a las clases en vivo que tienes habilitadas.
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Cargando…</div>
      ) : cursos.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
          No hay clases en vivo disponibles todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cursos.map((curso) => {
            const acceso = permisos.has(curso.id);
            return (
              <div key={curso.id} className="rounded-2xl border bg-card overflow-hidden group shadow-sm">
                <div className="relative aspect-square">
                  {curso.image_url ? (
                    <img src={curso.image_url} alt={curso.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{
                        background: `linear-gradient(135deg, ${curso.color_cover || "#7C6BFF"}, var(--violet-2))`,
                      }}
                    />
                  )}

                  {!acceso && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] grid place-items-center">
                      <div className="w-14 h-14 rounded-full bg-white/95 shadow-xl grid place-items-center">
                        <Lock className="w-7 h-7 text-violet-600" />
                      </div>
                    </div>
                  )}

                  {acceso && (
                    <div className="absolute top-3 right-3 rounded-full bg-emerald-500/95 text-white px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 shadow">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Acceso disponible
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="font-semibold line-clamp-2">{curso.nombre}</h3>
                  {curso.descripcion && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{curso.descripcion}</p>
                  )}

                  {acceso ? (
                    <button
                      onClick={() => setActiveId(curso.id)}
                      className="mt-3 w-full px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center justify-center gap-1"
                    >
                      <BookOpen className="w-4 h-4" />
                      Acceder
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="mt-3 w-full px-3 py-2 rounded-lg border text-sm opacity-60 flex items-center justify-center gap-1"
                    >
                      <Lock className="w-4 h-4" /> Sin acceso
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
