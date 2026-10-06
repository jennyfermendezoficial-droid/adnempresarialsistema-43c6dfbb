-- Operación de alumnas de mentoría: selección de cuentas, acompañantes,
-- datos bancarios propios y trazabilidad completa de abonos.
-- Mantiene separado el módulo de Profesores y no cambia sus tablas de pago.

CREATE TABLE IF NOT EXISTS public.pagos_mentoria_alumnas (
  alumna_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT TRUE,
  fecha_asignacion date NOT NULL DEFAULT CURRENT_DATE,
  seleccionado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pagos_mentoria_acompanantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumna_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acompanante_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orden smallint NOT NULL CHECK (orden BETWEEN 1 AND 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alumna_id, orden),
  UNIQUE (alumna_id, acompanante_id),
  CHECK (alumna_id <> acompanante_id)
);

CREATE TABLE IF NOT EXISTS public.pagos_mentoria_cuentas_bancarias (
  alumna_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  cedula_titular text,
  actualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pagos_mentoria_abonos
  ADD COLUMN IF NOT EXISTS banco_origen text,
  ADD COLUMN IF NOT EXISTS cuenta_origen text,
  ADD COLUMN IF NOT EXISTS titular_origen text,
  ADD COLUMN IF NOT EXISTS referencia_pago text,
  ADD COLUMN IF NOT EXISTS tarjeta_marca text,
  ADD COLUMN IF NOT EXISTS tarjeta_ultimos4 text,
  ADD COLUMN IF NOT EXISTS archivo_nombre text;

CREATE INDEX IF NOT EXISTS pagos_mentoria_acompanantes_alumna_idx
  ON public.pagos_mentoria_acompanantes (alumna_id, orden);
CREATE INDEX IF NOT EXISTS pagos_mentoria_acompanantes_cuenta_idx
  ON public.pagos_mentoria_acompanantes (acompanante_id);

ALTER TABLE public.pagos_mentoria_alumnas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_mentoria_acompanantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_mentoria_cuentas_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagos_mentoria_alumnas_gestion ON public.pagos_mentoria_alumnas;
CREATE POLICY pagos_mentoria_alumnas_gestion
ON public.pagos_mentoria_alumnas FOR ALL TO authenticated
USING (public.puede_pagos(auth.uid()))
WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS pagos_mentoria_acompanantes_gestion ON public.pagos_mentoria_acompanantes;
CREATE POLICY pagos_mentoria_acompanantes_gestion
ON public.pagos_mentoria_acompanantes FOR ALL TO authenticated
USING (
  public.puede_pagos(auth.uid())
  OR (
    alumna_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = auth.uid() AND a.activo = true
    )
  )
)
WITH CHECK (
  public.puede_pagos(auth.uid())
  OR (
    alumna_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = auth.uid() AND a.activo = true
    )
  )
);

DROP POLICY IF EXISTS pagos_mentoria_cuenta_select ON public.pagos_mentoria_cuentas_bancarias;
CREATE POLICY pagos_mentoria_cuenta_select
ON public.pagos_mentoria_cuentas_bancarias FOR SELECT TO authenticated
USING (
  public.puede_pagos(auth.uid())
  OR (
    alumna_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = auth.uid() AND a.activo = true
    )
  )
);

DROP POLICY IF EXISTS pagos_mentoria_cuenta_write ON public.pagos_mentoria_cuentas_bancarias;
CREATE POLICY pagos_mentoria_cuenta_write
ON public.pagos_mentoria_cuentas_bancarias FOR INSERT TO authenticated
WITH CHECK (
  public.puede_pagos(auth.uid())
  OR (
    alumna_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = auth.uid() AND a.activo = true
    )
  )
);

DROP POLICY IF EXISTS pagos_mentoria_cuenta_update ON public.pagos_mentoria_cuentas_bancarias;
CREATE POLICY pagos_mentoria_cuenta_update
ON public.pagos_mentoria_cuentas_bancarias FOR UPDATE TO authenticated
USING (
  public.puede_pagos(auth.uid())
  OR (
    alumna_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = auth.uid() AND a.activo = true
    )
  )
)
WITH CHECK (
  public.puede_pagos(auth.uid())
  OR (
    alumna_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = auth.uid() AND a.activo = true
    )
  )
);

DROP TRIGGER IF EXISTS pagos_mentoria_alumnas_updated_at ON public.pagos_mentoria_alumnas;
CREATE TRIGGER pagos_mentoria_alumnas_updated_at
BEFORE UPDATE ON public.pagos_mentoria_alumnas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS pagos_mentoria_cuentas_updated_at ON public.pagos_mentoria_cuentas_bancarias;
CREATE TRIGGER pagos_mentoria_cuentas_updated_at
BEFORE UPDATE ON public.pagos_mentoria_cuentas_bancarias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON TABLE public.pagos_mentoria_alumnas FROM anon;
REVOKE ALL ON TABLE public.pagos_mentoria_acompanantes FROM anon;
REVOKE ALL ON TABLE public.pagos_mentoria_cuentas_bancarias FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_mentoria_alumnas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_mentoria_acompanantes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_mentoria_cuentas_bancarias TO authenticated;

-- Todos los usuarios con rol Alumno quedan disponibles para que el administrador
-- seleccione manualmente cuáles pertenecen a la mentoría. No se crean cuentas ni roles.
CREATE OR REPLACE FUNCTION public.listar_usuarios_para_mentoria()
RETURNS TABLE(
  id uuid,
  nombre_completo text,
  email text,
  avatar_url text,
  estado text,
  seleccionada boolean,
  cuenta_bancaria_completa boolean,
  acompanantes_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para gestionar alumnas de mentoría';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nombre_completo,
    p.email,
    p.avatar_url,
    p.estado::text,
    EXISTS (
      SELECT 1 FROM public.pagos_mentoria_alumnas a
      WHERE a.alumna_id = p.id AND a.activo = true
    ) AS seleccionada,
    EXISTS (
      SELECT 1 FROM public.pagos_mentoria_cuentas_bancarias c
      WHERE c.alumna_id = p.id
        AND COALESCE(BTRIM(c.banco), '') <> ''
        AND COALESCE(BTRIM(c.tipo_cuenta), '') <> ''
        AND COALESCE(BTRIM(c.numero_cuenta), '') <> ''
        AND COALESCE(BTRIM(c.titular_cuenta), '') <> ''
    ) AS cuenta_bancaria_completa,
    (
      SELECT COUNT(*)::integer
      FROM public.pagos_mentoria_acompanantes ac
      WHERE ac.alumna_id = p.id
    ) AS acompanantes_count
  FROM public.profiles p
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'usuario'::public.app_role
  )
  ORDER BY COALESCE(NULLIF(BTRIM(p.nombre_completo), ''), p.email), p.email;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios_para_mentoria() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_para_mentoria() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guardar_alumna_mentoria(_alumna_id uuid, _activo boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para seleccionar alumnas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _alumna_id AND ur.role = 'usuario'::public.app_role
  ) THEN
    RAISE EXCEPTION 'La cuenta seleccionada no tiene rol de Alumno';
  END IF;

  INSERT INTO public.pagos_mentoria_alumnas(alumna_id, activo, seleccionado_por, updated_at)
  VALUES(_alumna_id, _activo, auth.uid(), now())
  ON CONFLICT (alumna_id) DO UPDATE
    SET activo = EXCLUDED.activo,
        seleccionado_por = EXCLUDED.seleccionado_por,
        updated_at = now();

  RETURN _activo;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_alumna_mentoria(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_alumna_mentoria(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.listar_acompanantes_mentoria(_alumna_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  nombre_completo text,
  email text,
  avatar_url text,
  orden smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  objetivo uuid := COALESCE(_alumna_id, auth.uid());
BEGIN
  IF objetivo <> auth.uid() AND NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para consultar acompañantes';
  END IF;

  IF NOT public.puede_pagos(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.pagos_mentoria_alumnas a
    WHERE a.alumna_id = objetivo AND a.activo = true
  ) THEN
    RAISE EXCEPTION 'La cuenta no está seleccionada como alumna de mentoría';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url, ac.orden
  FROM public.pagos_mentoria_acompanantes ac
  JOIN public.profiles p ON p.id = ac.acompanante_id
  WHERE ac.alumna_id = objetivo
  ORDER BY ac.orden;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_acompanantes_mentoria(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_acompanantes_mentoria(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.listar_usuarios_acompanantes()
RETURNS TABLE(id uuid, nombre_completo text, email text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.puede_pagos(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.pagos_mentoria_alumnas a
    WHERE a.alumna_id = auth.uid() AND a.activo = true
  ) THEN
    RAISE EXCEPTION 'La cuenta no está seleccionada como alumna de mentoría';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'usuario'::public.app_role
    )
  ORDER BY COALESCE(NULLIF(BTRIM(p.nombre_completo), ''), p.email), p.email;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios_acompanantes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_acompanantes() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guardar_acompanantes_mentoria(_alumna_id uuid, _acompanantes uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  objetivo uuid := COALESCE(_alumna_id, auth.uid());
  total integer;
  candidato uuid;
BEGIN
  IF objetivo <> auth.uid() AND NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para modificar acompañantes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pagos_mentoria_alumnas a
    WHERE a.alumna_id = objetivo AND a.activo = true
  ) THEN
    RAISE EXCEPTION 'Primero selecciona la cuenta como alumna de mentoría';
  END IF;

  IF COALESCE(array_length(_acompanantes, 1), 0) > 2 THEN
    RAISE EXCEPTION 'Una alumna puede tener como máximo 2 acompañantes';
  END IF;

  IF _acompanantes IS NULL THEN
    _acompanantes := ARRAY[]::uuid[];
  END IF;

  IF (SELECT COUNT(*) FROM unnest(_acompanantes) x) <> (SELECT COUNT(DISTINCT x) FROM unnest(_acompanantes) x) THEN
    RAISE EXCEPTION 'No se puede repetir un acompañante';
  END IF;

  FOREACH candidato IN ARRAY _acompanantes LOOP
    IF candidato = objetivo THEN
      RAISE EXCEPTION 'La alumna no puede seleccionarse a sí misma como acompañante';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = candidato AND ur.role = 'usuario'::public.app_role
    ) THEN
      RAISE EXCEPTION 'Los acompañantes deben ser cuentas de Alumno';
    END IF;
  END LOOP;

  DELETE FROM public.pagos_mentoria_acompanantes WHERE alumna_id = objetivo;

  IF array_length(_acompanantes, 1) IS NOT NULL THEN
    INSERT INTO public.pagos_mentoria_acompanantes(alumna_id, acompanante_id, orden)
    SELECT objetivo, x, row_number() OVER (ORDER BY ord)::smallint
    FROM unnest(_acompanantes) WITH ORDINALITY AS u(x, ord);
  END IF;

  SELECT COUNT(*) INTO total FROM public.pagos_mentoria_acompanantes WHERE alumna_id = objetivo;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_acompanantes_mentoria(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_acompanantes_mentoria(uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.obtener_datos_pago_alumna(_alumna_id uuid DEFAULT NULL)
RETURNS TABLE(
  alumna_id uuid,
  seleccionada boolean,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  cedula_titular text,
  completo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  objetivo uuid := COALESCE(_alumna_id, auth.uid());
BEGIN
  IF objetivo <> auth.uid() AND NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para consultar datos bancarios';
  END IF;

  RETURN QUERY
  SELECT
    objetivo,
    EXISTS (SELECT 1 FROM public.pagos_mentoria_alumnas a WHERE a.alumna_id = objetivo AND a.activo = true),
    c.banco,
    c.tipo_cuenta,
    c.numero_cuenta,
    c.titular_cuenta,
    c.cedula_titular,
    (
      COALESCE(BTRIM(c.banco), '') <> ''
      AND COALESCE(BTRIM(c.tipo_cuenta), '') <> ''
      AND COALESCE(BTRIM(c.numero_cuenta), '') <> ''
      AND COALESCE(BTRIM(c.titular_cuenta), '') <> ''
    )
  FROM (SELECT 1) base
  LEFT JOIN public.pagos_mentoria_cuentas_bancarias c ON c.alumna_id = objetivo;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_datos_pago_alumna(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_datos_pago_alumna(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guardar_datos_pago_alumna(
  _alumna_id uuid,
  _banco text,
  _tipo_cuenta text,
  _numero_cuenta text,
  _titular_cuenta text,
  _cedula_titular text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _alumna_id <> auth.uid() AND NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para guardar datos bancarios';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _alumna_id AND ur.role = 'usuario'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Los datos bancarios de este módulo son solo para cuentas de Alumno';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pagos_mentoria_alumnas a
    WHERE a.alumna_id = _alumna_id AND a.activo = true
  ) THEN
    RAISE EXCEPTION 'Primero selecciona la cuenta como alumna de mentoría';
  END IF;

  IF BTRIM(COALESCE(_banco, '')) = ''
     OR BTRIM(COALESCE(_tipo_cuenta, '')) = ''
     OR BTRIM(COALESCE(_numero_cuenta, '')) = ''
     OR BTRIM(COALESCE(_titular_cuenta, '')) = '' THEN
    RAISE EXCEPTION 'Banco, tipo de cuenta, número y titular son obligatorios';
  END IF;

  INSERT INTO public.pagos_mentoria_cuentas_bancarias(
    alumna_id, banco, tipo_cuenta, numero_cuenta, titular_cuenta, cedula_titular, actualizado_por, updated_at
  )
  VALUES(
    _alumna_id, BTRIM(_banco), BTRIM(_tipo_cuenta), BTRIM(_numero_cuenta), BTRIM(_titular_cuenta), NULLIF(BTRIM(_cedula_titular), ''), auth.uid(), now()
  )
  ON CONFLICT (alumna_id) DO UPDATE SET
    banco = EXCLUDED.banco,
    tipo_cuenta = EXCLUDED.tipo_cuenta,
    numero_cuenta = EXCLUDED.numero_cuenta,
    titular_cuenta = EXCLUDED.titular_cuenta,
    cedula_titular = EXCLUDED.cedula_titular,
    actualizado_por = EXCLUDED.actualizado_por,
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_datos_pago_alumna(uuid,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_datos_pago_alumna(uuid,text,text,text,text,text) TO authenticated, service_role;

COMMENT ON TABLE public.pagos_mentoria_alumnas IS 'Selección administrativa de cuentas existentes que pertenecen a la mentoría de alumnas.';
COMMENT ON TABLE public.pagos_mentoria_acompanantes IS 'Hasta dos cuentas de Alumno asociadas como acompañantes de una alumna de mentoría.';
COMMENT ON TABLE public.pagos_mentoria_cuentas_bancarias IS 'Datos bancarios de pago de la alumna de mentoría, separados de los datos de Profesores.';

NOTIFY pgrst, 'reload schema';
