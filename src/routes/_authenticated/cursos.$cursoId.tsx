import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CursoDetalle } from "@/components/CursoDetalle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { esContenidoEquipo } from "@/lib/contenido-equipo";

export const Route = createFileRoute("/_authenticated/cursos/$cursoId")({ component: Page });

function Page() {
  const { cursoId } = Route.useParams();
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [loading, setLoading] = useState(true);
  const [restringido, setRestringido] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data } = await supabase.from("cursos").select("*").eq("id", cursoId).maybeSingle();
      if (cancel) return;
      const row = data as { descripcion?: string | null; solo_equipo?: boolean | null } | null;
      const soloEquipo = Boolean(row?.solo_equipo) || esContenidoEquipo(row?.descripcion);
      setRestringido(soloEquipo && !isStaff);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [cursoId, isStaff]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  if (restringido) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-2xl border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">Contenido exclusivo del equipo</h1>
          <p className="text-sm text-muted-foreground mt-2">Solo Profesores y Líder/Dueño pueden acceder a este módulo.</p>
        </div>
      </div>
    );
  }

  return <CursoDetalle cursoId={cursoId} volver />;
}
