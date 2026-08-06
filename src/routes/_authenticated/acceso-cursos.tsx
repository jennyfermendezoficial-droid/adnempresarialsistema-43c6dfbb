import { createFileRoute } from "@tanstack/react-router";
import { AccesoCursosPanel } from "@/components/AccesoCursosPanel";

export const Route = createFileRoute("/_authenticated/acceso-cursos")({ component: Page });

function Page() {
  return <AccesoCursosPanel tipo="curso" titulo="Acceso a cursos" plural="los cursos" />;
}
