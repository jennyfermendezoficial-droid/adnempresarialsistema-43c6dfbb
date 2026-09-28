-- Gestión separada de pagos de trabajadores freelance.
-- No modifica tablas ni cálculos de pagos de profesores ni de alumnas.
-- Horario laboral (07:00–13:00 y 14:30–17:30) se calcula en la app con
-- src/lib/pagos-horario.ts, igual que en Profesores.

CREATE TABLE IF NOT EXISTS public.freelancers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  email text,
  telefono text,
  servicio text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.freelance_tarifas_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE RESTRICT,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  valor_hora_laboral numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_hora_laboral >= 0),
  -- NULL = usa el mismo valor que la hora laboral.
  valor_hora_fuera numeric(12,2) CHECK (valor_hora_fuera IS NULL OR valor_hora_fuera >= 0),
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT freelance_tarifas_mes_periodo_key UNIQUE (freelancer_id, mes, anio)
);

CREATE TABLE IF NOT EXISTS public.freelance_registros_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE RESTRICT,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  duracion_min integer NOT NULL CHECK (duracion_min BETWEEN 1 AND 720),
  tarea text NOT NULL CHECK (char_length(btrim(tarea)) BETWEEN 3 AND 300),
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freelance_registros_horas_periodo_idx
  ON public.freelance_registros_horas (freelancer_id, fecha, hora_inicio);

CREATE TABLE IF NOT EXISTS public.freelance_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE RESTRICT,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  tipo text NOT NULL CHECK (tipo IN ('bono', 'descuento')),
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 200),
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freelance_ajustes_periodo_idx
  ON public.freelance_ajustes (freelancer_id, anio, mes);

CREATE TABLE IF NOT EXISTS public.freelance_abonos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE RESTRICT,
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

CREATE INDEX IF NOT EXISTS freelance_abonos_periodo_idx
  ON public.freelance_abonos (freelancer_id, anio, mes, fecha_pago DESC);

-- Validación de servidor: no se registran horas futuras ni horas que se
-- crucen con otro registro del mismo freelancer (evita cobrar dos veces).
CREATE OR REPLACE FUNCTION public.validar_freelance_registro_horas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _inicio timestamp := NEW.fecha + NEW.hora_inicio;
  _fin timestamp := NEW.fecha + NEW.hora_inicio + make_interval(mins => NEW.duracion_min);
BEGIN
  IF _fin > (now() AT TIME ZONE 'America/Guayaquil') THEN
    RAISE EXCEPTION 'No se pueden registrar horas futuras: el trabajo debe haber terminado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.freelance_registros_horas r
    WHERE r.freelancer_id = NEW.freelancer_id
      AND r.id <> NEW.id
      AND tsrange(r.fecha + r.hora_inicio, r.fecha + r.hora_inicio + make_interval(mins => r.duracion_min))
          && tsrange(_inicio, _fin)
  ) THEN
    RAISE EXCEPTION 'Ese horario se cruza con otro registro del mismo freelancer.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freelance_registros_horas_validar ON public.freelance_registros_horas;
CREATE TRIGGER freelance_registros_horas_validar
BEFORE INSERT OR UPDATE ON public.freelance_registros_horas
FOR EACH ROW EXECUTE FUNCTION public.validar_freelance_registro_horas();

ALTER TABLE public.freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelance_tarifas_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelance_registros_horas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelance_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freelance_abonos ENABLE ROW LEVEL SECURITY;

-- Mismo criterio de acceso que Pagos e informes (líderes y acceso autorizado).
DROP POLICY IF EXISTS "freelancers_gestion" ON public.freelancers;
CREATE POLICY "freelancers_gestion" ON public.freelancers
FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "freelance_tarifas_mes_gestion" ON public.freelance_tarifas_mes;
CREATE POLICY "freelance_tarifas_mes_gestion" ON public.freelance_tarifas_mes
FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "freelance_registros_horas_gestion" ON public.freelance_registros_horas;
CREATE POLICY "freelance_registros_horas_gestion" ON public.freelance_registros_horas
FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "freelance_ajustes_gestion" ON public.freelance_ajustes;
CREATE POLICY "freelance_ajustes_gestion" ON public.freelance_ajustes
FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "freelance_abonos_gestion" ON public.freelance_abonos;
CREATE POLICY "freelance_abonos_gestion" ON public.freelance_abonos
FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

REVOKE ALL ON TABLE public.freelancers FROM anon;
REVOKE ALL ON TABLE public.freelance_tarifas_mes FROM anon;
REVOKE ALL ON TABLE public.freelance_registros_horas FROM anon;
REVOKE ALL ON TABLE public.freelance_ajustes FROM anon;
REVOKE ALL ON TABLE public.freelance_abonos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freelancers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freelance_tarifas_mes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freelance_registros_horas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freelance_ajustes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.freelance_abonos TO authenticated;

COMMENT ON TABLE public.freelancers IS
  'Trabajadores freelance de la empresa. Se desactivan en lugar de borrarse para conservar el historial.';
COMMENT ON TABLE public.freelance_tarifas_mes IS
  'Valor por hora laboral y fuera de horario de cada freelancer por mes.';
COMMENT ON TABLE public.freelance_registros_horas IS
  'Horas trabajadas por freelancers. El reparto laboral / fuera de horario se calcula por minutos reales.';
COMMENT ON TABLE public.freelance_ajustes IS
  'Bonos y descuentos mensuales de freelancers.';
COMMENT ON TABLE public.freelance_abonos IS
  'Pagos realizados a freelancers con datos y URL opcional del comprobante.';

NOTIFY pgrst, 'reload schema';
