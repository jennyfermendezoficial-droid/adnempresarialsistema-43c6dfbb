export interface FilaPrecio {
  key: string;
  tipo: "clase" | "1a1";
  refId: string;
  profesorId: string;
  profesor: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  detalle: string;
  monto: number;
}

/**
 * La actividad por clase/sesión ya no se muestra como una tabla general de
 * asignación de precios. El detalle pertenece al informe individual de cada
 * profesor. Se conserva la firma para no alterar la estructura de Pagos.
 */
export function PagosPrecios(_props: {
  filas: FilaPrecio[];
  mes: number;
  anio: number;
  puedeEditar: boolean;
  onRefresh: () => void;
}) {
  return null;
}
