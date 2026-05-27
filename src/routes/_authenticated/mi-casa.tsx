import { createFileRoute } from "@tanstack/react-router";
import { MovimientosPage } from "@/components/MovimientosPage";
export const Route = createFileRoute("/_authenticated/mi-casa")({
  component: () => <MovimientosPage ambito="casa" titulo="Mi casa" subtitulo="Presupuesto personal y familiar" />,
});
