import { createFileRoute } from "@tanstack/react-router";
import { GestionContenidosEquipo } from "@/components/GestionContenidosEquipo";

export const Route = createFileRoute("/_authenticated/cursos-y-clases-equipo")({
  component: Page,
});

function Page() {
  return <GestionContenidosEquipo />;
}
