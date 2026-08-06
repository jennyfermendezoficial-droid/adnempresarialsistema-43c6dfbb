import { createFileRoute } from "@tanstack/react-router";
import { CursosBiblioteca } from "@/components/CursosBiblioteca";

export const Route = createFileRoute("/_authenticated/cursos/")({ component: Page });

function Page() {
  return (
    <CursosBiblioteca
      tipo="curso"
      etiqueta="curso"
      titulo="Cursos"
      subtitulo="Entra a un curso para ver todos los módulos y clases."
    />
  );
}
