import { createFileRoute } from "@tanstack/react-router";
import { CursosBiblioteca } from "@/components/CursosBiblioteca";

export const Route = createFileRoute("/_authenticated/cursos/")({
  validateSearch: (search: Record<string, unknown>): { modulo?: string } => ({
    modulo: typeof search.modulo === "string" ? search.modulo : undefined,
  }),
  component: Page,
});

function Page() {
  const { modulo } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CursosBiblioteca
      tipo="curso"
      etiqueta="curso"
      titulo="Cursos"
      subtitulo="Entra a un curso para ver todos los módulos y clases."
      grupoId={modulo}
      onGrupo={(id) => navigate({ search: id ? { modulo: id } : {} })}
    />
  );
}
