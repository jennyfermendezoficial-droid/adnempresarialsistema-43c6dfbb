import { createFileRoute } from "@tanstack/react-router";
import { CursosBiblioteca } from "@/components/CursosBiblioteca";
import { GestionContenidosEquipo } from "@/components/GestionContenidosEquipo";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/cursos/")({ component: Page });

function Page() {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";

  if (isStaff) return <GestionContenidosEquipo />;

  return (
    <CursosBiblioteca
      tipo="curso"
      etiqueta="curso"
      titulo="Cursos"
      subtitulo="Entra a un curso para ver todos los módulos y clases."
    />
  );
}
