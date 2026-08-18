-- Compatibilidad con entornos donde una prueba anterior ya creó
-- incidencias_registro_horas sin las columnas nuevas de seguimiento.

ALTER TABLE public.incidencias_registro_horas
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente';

ALTER TABLE public.incidencias_registro_horas
  ADD COLUMN IF NOT EXISTS motivo_profesor text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incidencias_registro_horas_estado_check'
      AND conrelid = 'public.incidencias_registro_horas'::regclass
  ) THEN
    ALTER TABLE public.incidencias_registro_horas
      ADD CONSTRAINT incidencias_registro_horas_estado_check
      CHECK (estado IN ('pendiente','en_duda','resuelta'));
  END IF;
END
$$;
