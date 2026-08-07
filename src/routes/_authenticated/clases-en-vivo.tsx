import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CursoDetalle } from "@/components/CursoDetalle";

export const Route = createFileRoute("/_authenticated/clases-en-vivo")({ component: Page });

function Page() {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [cursoId, setCursoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("cursos").select("id").eq("tipo", "clase_en_vivo").order("orden").limit(1);
      let id = (data as { id: string }[] | null)?.[0]?.id ?? null;
      if (!id && isStaff) {
        const { data: nuevo } = await supabase
          .from("cursos").insert({ nombre: "Clases en vivo", orden: 0, tipo: "clase_en_vivo" })
          .select("id").single();
        id = (nuevo as { id: string } | null)?.id ?? null;
      }
      if (!cancel) { setCursoId(id); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [isStaff]);

  if (loading) {
    return <div className="p-10 text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!cursoId) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Todavía no hay clases en vivo disponibles.
      </div>
    );
  }
  return <CursoDetalle cursoId={cursoId} />;
}
