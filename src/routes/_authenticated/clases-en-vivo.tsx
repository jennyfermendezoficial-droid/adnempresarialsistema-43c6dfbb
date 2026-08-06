import { createFileRoute } from "@tanstack/react-router";
import { CursosBiblioteca } from "@/components/CursosBiblioteca";

export const Route = createFileRoute("/_authenticated/clases-en-vivo")({ component: Page });

function Page() {
  return (
    <CursosBiblioteca
      tipo="clase_en_vivo"
      etiqueta="clase en vivo"
      titulo="Clases en vivo"
      subtitulo="Entra para ver las grabaciones y materiales de las clases en vivo."
    />
  );
}
