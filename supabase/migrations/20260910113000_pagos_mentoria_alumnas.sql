-- Gestión separada de pagos de mentoría de alumnas.
-- No modifica tablas ni cálculos de pagos de profesores.

CREATE TABLE IF NOT EXISTS public.pagos_mentoria_totales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumna_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pagos_mentoria_totales_alumna_periodo_key UNIQUE (alumna_id, mes, anio)
);

CREATE TABLE IF NOT EXISTS public.pagos_mentoria_abonos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumna_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  fecha_pago date NOT NULL DEFAULT CURRENT_DATE,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  tipo_pago text NOT NULL DEFAULT 'transferencia',
  numero_comprobante text,
  observacion text,
  archivo_url text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pagos_mentoria_abonos_alumna_periodo_idx
  ON public.pagos_mentoria_abonos (alumna_id, anio, mes, fecha_pago DESC);

ALTER TABLE public.pagos_mentoria_totales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_mentoria_abonos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pagos_mentoria_totales_gestion" ON public.pagos_mentoria_totales;
CREATE POLICY "pagos_mentoria_totales_gestion"
ON public.pagos_mentoria_totales
FOR ALL
TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "pagos_mentoria_abonos_gestion" ON public.pagos_mentoria_abonos;
CREATE POLICY "pagos_mentoria_abonos_gestion"
ON public.pagos_mentoria_abonos
FOR ALL
TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

REVOKE ALL ON TABLE public.pagos_mentoria_totales FROM anon;
REVOKE ALL ON TABLE public.pagos_mentoria_abonos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pagos_mentoria_totales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pagos_mentoria_abonos TO authenticated;

COMMENT ON TABLE public.pagos_mentoria_totales IS
  'Valor total de mentoría asignado a cada alumna por mes. Pagado y saldo se calculan desde los abonos.';
COMMENT ON TABLE public.pagos_mentoria_abonos IS
  'Abonos de mentoría de alumnas con datos y URL opcional del comprobante.';

NOTIFY pgrst, 'reload schema';
