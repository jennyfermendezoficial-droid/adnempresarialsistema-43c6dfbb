import { createFileRoute } from "@tanstack/react-router";
import { CursoDetalle } from "@/components/CursoDetalle";

export const Route = createFileRoute("/_authenticated/cursos/$cursoId")({ component: Page });

function Page() {
  const { cursoId } = Route.useParams();
  return <CursoDetalle cursoId={cursoId} volver />;
}
