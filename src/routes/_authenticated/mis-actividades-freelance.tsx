import { createFileRoute } from "@tanstack/react-router";
import { MisActividadesFreelance } from "@/components/MisActividadesFreelance";
import { FreelancePanel } from "./pagos_.freelance";
export const Route = createFileRoute("/_authenticated/mis-actividades-freelance")({
  head: () => ({ meta: [
    { title: "Mis actividades freelance · ADN Empresarial" },
    { name: "description", content: "Registra tus actividades diarias con horas, descripción y archivos, y descarga tu informe en PDF." },
    { property: "og:title", content: "Mis actividades freelance · ADN Empresarial" },
    { property: "og:description", content: "Registra tus actividades diarias con horas, descripción y archivos, y descarga tu informe en PDF." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});


function Page() { return <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6"><MisActividadesFreelance /><div className="border-t pt-6"><FreelancePanel embebido /></div></div>; }
