-- Freelance · fase 2: tarifa acordada, datos del trabajo diario, ajustes de
-- pago (bonificación, deducción, multa, corrección) e informes PDF en Storage.
-- Requiere 20260928120000_pagos_freelance.sql. Solo agrega columnas, una
-- tabla y un bucket: no borra datos ni toca Profesores, Alumnas ni permisos.
-- Es idempotente: se puede ejecutar más de una vez.

-- 1) Tarifa acordada por hora de cada freelancer.
ALTER TABLE public.freelancers
  ADD COLUMN IF NOT EXISTS tarifa_hora numeric(12,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.freelancers
    ADD CONSTRAINT freelancers_tarifa_hora_check CHECK (tarifa_hora >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Datos del trabajo diario. `tarea` sigue siendo la actividad (título).
--    tarifa_hora guarda la tarifa vigente al registrar: si la tarifa cambia
--    después, los trabajos anteriores conservan su valor.
ALTER TABLE public.freelance_registros_horas
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS tarifa_hora numeric(12,2);

DO $$ BEGIN
  ALTER TABLE public.freelance_registros_horas
    ADD CONSTRAINT freelance_registros_horas_tarifa_hora_check CHECK (tarifa_hora IS NULL OR tarifa_hora >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Ajustes de pago. Se conservan 'bono' y 'descuento' por compatibilidad.
--    Solo la corrección de pago admite monto negativo (resta) o positivo (suma).
ALTER TABLE public.freelance_ajustes DROP CONSTRAINT IF EXISTS freelance_ajustes_tipo_check;
ALTER TABLE public.freelance_ajustes DROP CONSTRAINT IF EXISTS freelance_ajustes_monto_check;
ALTER TABLE public.freelance_ajustes
  ADD CONSTRAINT freelance_ajustes_tipo_check
  CHECK (tipo IN ('bonificacion', 'deduccion', 'multa', 'correccion', 'bono', 'descuento'));
ALTER TABLE public.freelance_ajustes
  ADD CONSTRAINT freelance_ajustes_monto_check
  CHECK (monto <> 0 AND (tipo = 'correccion' OR monto > 0));

-- 4) Cuenta de la empresa (líder) desde la que se hizo el pago.
--    Reutiliza pagos_cuentas_bancarias, la misma tabla de Profesores.
ALTER TABLE public.freelance_abonos
  ADD COLUMN IF NOT EXISTS cuenta_empresa_id uuid REFERENCES public.pagos_cuentas_bancarias(id) ON DELETE SET NULL;

-- 5) Informes PDF (diarios y semanales).
CREATE TABLE IF NOT EXISTS public.freelance_informes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('diario', 'semanal')),
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  archivo_path text NOT NULL UNIQUE,
  nombre_archivo text NOT NULL,
  tamano_bytes integer CHECK (tamano_bytes IS NULL OR tamano_bytes >= 0),
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT freelance_informes_rango_check CHECK (
    fecha_fin >= fecha_inicio
    AND (tipo = 'semanal' OR fecha_fin = fecha_inicio)
    AND fecha_fin - fecha_inicio <= 6
  )
);

CREATE INDEX IF NOT EXISTS freelance_informes_periodo_idx
  ON public.freelance_informes (freelancer_id, fecha_inicio, fecha_fin);

ALTER TABLE public.freelance_informes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freelance_informes_gestion" ON public.freelance_informes;
CREATE POLICY "freelance_informes_gestion" ON public.freelance_informes
FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

REVOKE ALL ON TABLE public.freelance_informes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freelance_informes TO authenticated;

COMMENT ON TABLE public.freelance_informes IS
  'Informes PDF diarios o semanales de freelancers. El archivo vive en el bucket privado freelance-informes.';

-- 6) Bucket privado para los PDF. Estructura: <nombre-freelancer>-<id>/<archivo>.pdf
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('freelance-informes', 'freelance-informes', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "freelance_informes_read" ON storage.objects;
CREATE POLICY "freelance_informes_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'freelance-informes' AND public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "freelance_informes_insert" ON storage.objects;
CREATE POLICY "freelance_informes_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'freelance-informes' AND public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "freelance_informes_delete" ON storage.objects;
CREATE POLICY "freelance_informes_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'freelance-informes' AND public.puede_pagos(auth.uid()));

NOTIFY pgrst, 'reload schema';
