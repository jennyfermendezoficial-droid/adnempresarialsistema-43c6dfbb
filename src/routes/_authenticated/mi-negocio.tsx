import { createFileRoute } from "@tanstack/react-router";
import { MovimientosPage } from "@/components/MovimientosPage";
export const Route = createFileRoute("/_authenticated/mi-negocio")({
  component: () => <MovimientosPage ambito="negocio" titulo="Mi negocio" subtitulo="Ingresos y gastos del negocio" />,
});
