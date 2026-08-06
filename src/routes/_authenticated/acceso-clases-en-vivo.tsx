import { createFileRoute } from "@tanstack/react-router";
import { AccesoCursosPanel } from "@/components/AccesoCursosPanel";

export const Route = createFileRoute("/_authenticated/acceso-clases-en-vivo")({ component: Page });

function Page() {
  return <AccesoCursosPanel tipo="clase_en_vivo" titulo="Acceso a clases en vivo" plural="las clases en vivo" />;
}
