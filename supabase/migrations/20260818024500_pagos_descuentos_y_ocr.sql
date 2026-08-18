-- Extensión incremental del flujo existente de comprobantes.
-- Los descuentos se registran como movimientos del mismo periodo para que
-- el estado pagado/parcial existente los tome en cuenta sin duplicar lógica.
ALTER TABLE public.pagos_comprobantes
  ADD COLUMN IF NOT EXISTS es_descuento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_descuento text;

CREATE INDEX IF NOT EXISTS pagos_comprobantes_descuento_idx
  ON public.pagos_comprobantes (profesor_id, anio, mes, es_descuento);

COMMENT ON COLUMN public.pagos_comprobantes.es_descuento IS
  'Indica que el movimiento reduce el saldo del mes sin representar una transferencia al profesor.';

COMMENT ON COLUMN public.pagos_comprobantes.motivo_descuento IS
  'Motivo administrativo del descuento aplicado al profesor en ese periodo.';
