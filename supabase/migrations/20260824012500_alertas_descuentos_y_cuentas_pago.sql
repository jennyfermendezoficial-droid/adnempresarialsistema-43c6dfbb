-- Alertas operativas de Pagos e informes, descuentos por horas pendientes
-- y almacenamiento seguro para imágenes bancarias.

ALTER TABLE public.pagos_descuentos
  ADD COLUMN IF NOT EXISTS referencia_tipo text,
  ADD COLUMN IF NOT EXISTS referencia_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_descuentos_registro_pendiente_unico
  ON public.pagos_descuentos (referencia_tipo, referencia_id)
  WHERE referencia_id IS NOT NULL;

-- Imágenes de bancos / cooperativas. Las portadas de cursos no se tocan.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bank-images',
  'bank-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "bank_images_read" ON storage.objects;
CREATE POLICY "bank_images_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'bank-images');

DROP POLICY IF EXISTS "bank_images_insert" ON storage.objects;
CREATE POLICY "bank_images_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bank-images'
  AND (
    (
      (storage.foldername(name))[1] = 'profesores'
      AND (storage.foldername(name))[2] = auth.uid()::text
      AND public.has_role(auth.uid(), 'soporte')
    )
    OR (
      (storage.foldername(name))[1] = 'empresa'
      AND public.puede_pagos(auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "bank_images_update" ON storage.objects;
CREATE POLICY "bank_images_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'bank-images'
  AND (
    ((storage.foldername(name))[1] = 'profesores' AND (storage.foldername(name))[2] = auth.uid()::text)
    OR ((storage.foldername(name))[1] = 'empresa' AND public.puede_pagos(auth.uid()))
  )
)
WITH CHECK (
  bucket_id = 'bank-images'
  AND (
    ((storage.foldername(name))[1] = 'profesores' AND (storage.foldername(name))[2] = auth.uid()::text)
    OR ((storage.foldername(name))[1] = 'empresa' AND public.puede_pagos(auth.uid()))
  )
);

DROP POLICY IF EXISTS "bank_images_delete" ON storage.objects;
CREATE POLICY "bank_images_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'bank-images'
  AND (
    ((storage.foldername(name))[1] = 'profesores' AND (storage.foldername(name))[2] = auth.uid()::text)
    OR ((storage.foldername(name))[1] = 'empresa' AND public.puede_pagos(auth.uid()))
  )
);

-- La persona autorizada para Pagos puede leer los datos bancarios del equipo.
CREATE OR REPLACE FUNCTION public.perfiles_pagos(_ids uuid[])
RETURNS TABLE(
  id uuid,
  nombre_completo text,
  email text,
  avatar_url text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  banco_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url,
         p.banco, p.tipo_cuenta, p.numero_cuenta, p.titular_cuenta, p.banco_logo_url
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND (public.puede_pagos(auth.uid()) OR p.id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.perfiles_pagos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfiles_pagos(uuid[]) TO authenticated, service_role;

-- Estado bancario de todos los profesores para la Ingeniera/Líder.
CREATE OR REPLACE FUNCTION public.estado_cuentas_profesores()
RETURNS TABLE(
  profesor_id uuid,
  nombre text,
  email text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  banco_logo_url text,
  completa boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para consultar cuentas de pago';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    p.id,
    COALESCE(NULLIF(BTRIM(p.nombre_completo), ''), p.email),
    p.email,
    p.banco,
    p.tipo_cuenta,
    p.numero_cuenta,
    p.titular_cuenta,
    p.banco_logo_url,
    (
      COALESCE(BTRIM(p.banco), '') <> ''
      AND COALESCE(BTRIM(p.tipo_cuenta), '') <> ''
      AND COALESCE(BTRIM(p.numero_cuenta), '') <> ''
      AND COALESCE(BTRIM(p.titular_cuenta), '') <> ''
      AND COALESCE(BTRIM(p.banco_logo_url), '') <> ''
    ) AS completa
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'soporte'::public.app_role
  ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.estado_cuentas_profesores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_cuentas_profesores() TO authenticated, service_role;

-- Detalle exacto de clases/sesiones terminadas sin duración real registrada.
CREATE OR REPLACE FUNCTION public.detalle_horas_pendientes(_mes integer DEFAULT NULL, _anio integer DEFAULT NULL)
RETURNS TABLE(
  tipo text,
  referencia_id uuid,
  profesor_id uuid,
  profesor_nombre text,
  fecha date,
  hora_inicio text,
  hora_fin text,
  contexto text,
  dias_pendiente integer,
  notificada boolean,
  descuento_aplicado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para revisar horas pendientes';
  END IF;

  RETURN QUERY
  WITH pendientes AS (
    SELECT
      'clase'::text AS tipo,
      c.id AS referencia_id,
      c.profesor_id,
      COALESCE(NULLIF(BTRIM(p.nombre_completo), ''), p.email) AS profesor_nombre,
      c.fecha,
      c.hora_inicio::text AS hora_inicio,
      c.hora_fin::text AS hora_fin,
      COALESCE(NULLIF(BTRIM(c.titulo), ''), 'Clase en vivo') AS contexto
    FROM public.clases_en_vivo c
    JOIN public.profiles p ON p.id = c.profesor_id
    WHERE c.profesor_id IS NOT NULL
      AND COALESCE(c.duracion_min, 0) <= 0
      AND (
        c.finalizada_at IS NOT NULL
        OR c.fecha < CURRENT_DATE
        OR (c.fecha = CURRENT_DATE AND c.hora_fin < LOCALTIME)
      )
      AND (_mes IS NULL OR EXTRACT(MONTH FROM c.fecha)::integer = _mes)
      AND (_anio IS NULL OR EXTRACT(YEAR FROM c.fecha)::integer = _anio)

    UNION ALL

    SELECT
      '1a1'::text AS tipo,
      s.id AS referencia_id,
      s.profesor_id,
      COALESCE(NULLIF(BTRIM(p.nombre_completo), ''), p.email) AS profesor_nombre,
      s.fecha,
      s.hora_inicio::text AS hora_inicio,
      COALESCE(s.hora_fin::text, '') AS hora_fin,
      COALESCE(NULLIF(BTRIM(a.nombre_completo), ''), a.email, 'Estudiante') AS contexto
    FROM public.sesiones_1a1 s
    JOIN public.profiles p ON p.id = s.profesor_id
    LEFT JOIN public.profiles a ON a.id = s.alumna_id
    WHERE COALESCE(s.duracion_min, 0) <= 0
      AND LOWER(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada')
      AND (
        s.finalizada_at IS NOT NULL
        OR s.fecha < CURRENT_DATE
        OR (s.fecha = CURRENT_DATE AND COALESCE(s.hora_fin, s.hora_inicio) < LOCALTIME)
      )
      AND (_mes IS NULL OR EXTRACT(MONTH FROM s.fecha)::integer = _mes)
      AND (_anio IS NULL OR EXTRACT(YEAR FROM s.fecha)::integer = _anio)
  )
  SELECT
    q.tipo,
    q.referencia_id,
    q.profesor_id,
    q.profesor_nombre,
    q.fecha,
    q.hora_inicio,
    q.hora_fin,
    q.contexto,
    GREATEST((CURRENT_DATE - q.fecha), 0)::integer AS dias_pendiente,
    EXISTS (
      SELECT 1 FROM public.notificaciones n
      WHERE n.usuario_id = q.profesor_id
        AND n.tipo = 'registro_horas_pendiente'
        AND n.referencia_id = q.referencia_id
        AND n.leida = false
    ) AS notificada,
    EXISTS (
      SELECT 1 FROM public.pagos_descuentos d
      WHERE d.referencia_tipo = q.tipo
        AND d.referencia_id = q.referencia_id
    ) AS descuento_aplicado
  FROM pendientes q
  ORDER BY q.fecha ASC, q.hora_inicio ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.detalle_horas_pendientes(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detalle_horas_pendientes(integer, integer) TO authenticated, service_role;

-- Envía/reaviva una notificación al profesor; no genera datos de pago ni descuentos.
CREATE OR REPLACE FUNCTION public.notificar_registro_pendiente(_tipo text, _referencia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  f date;
  contexto_txt text;
  tipo_txt text;
  titulo_txt text := 'Registro de horas pendiente';
  cuerpo_txt text;
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para notificar profesores';
  END IF;

  IF _tipo = 'clase' THEN
    SELECT c.profesor_id, c.fecha, COALESCE(NULLIF(BTRIM(c.titulo), ''), 'Clase en vivo')
      INTO pid, f, contexto_txt
    FROM public.clases_en_vivo c
    WHERE c.id = _referencia_id AND COALESCE(c.duracion_min, 0) <= 0;
    tipo_txt := 'clase en vivo';
  ELSIF _tipo = '1a1' THEN
    SELECT s.profesor_id, s.fecha, COALESCE(NULLIF(BTRIM(a.nombre_completo), ''), a.email, 'Estudiante')
      INTO pid, f, contexto_txt
    FROM public.sesiones_1a1 s
    LEFT JOIN public.profiles a ON a.id = s.alumna_id
    WHERE s.id = _referencia_id
      AND COALESCE(s.duracion_min, 0) <= 0
      AND LOWER(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada');
    tipo_txt := 'sesión 1 a 1';
  ELSE
    RAISE EXCEPTION 'Tipo de registro no válido';
  END IF;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'El registro ya no está pendiente o no existe';
  END IF;

  cuerpo_txt := 'Falta registrar la duración de tu ' || tipo_txt || ' del ' || to_char(f, 'DD/MM/YYYY') || ' · ' || contexto_txt || '.';

  UPDATE public.notificaciones n
     SET titulo = titulo_txt,
         cuerpo = cuerpo_txt,
         url = '/mis-clases-asignadas',
         actor_id = auth.uid(),
         created_at = now()
   WHERE n.usuario_id = pid
     AND n.tipo = 'registro_horas_pendiente'
     AND n.referencia_id = _referencia_id
     AND n.leida = false;

  IF NOT FOUND THEN
    INSERT INTO public.notificaciones(usuario_id, tipo, titulo, cuerpo, url, referencia_id, actor_id)
    VALUES(pid, 'registro_horas_pendiente', titulo_txt, cuerpo_txt, '/mis-clases-asignadas', _referencia_id, auth.uid());
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_registro_pendiente(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_registro_pendiente(text, uuid) TO authenticated, service_role;

-- Aplica una sola sanción por incidencia usando la tabla existente de Descuentos.
CREATE OR REPLACE FUNCTION public.aplicar_descuento_registro_pendiente(
  _tipo text,
  _referencia_id uuid,
  _monto numeric,
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  f date;
  contexto_txt text;
  tipo_txt text;
  motivo_txt text;
  descuento_id uuid;
  cuerpo_txt text;
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para aplicar descuentos';
  END IF;

  IF _monto IS NULL OR _monto <= 0 THEN
    RAISE EXCEPTION 'El valor del descuento debe ser mayor a cero';
  END IF;

  IF _tipo = 'clase' THEN
    SELECT c.profesor_id, c.fecha, COALESCE(NULLIF(BTRIM(c.titulo), ''), 'Clase en vivo')
      INTO pid, f, contexto_txt
    FROM public.clases_en_vivo c
    WHERE c.id = _referencia_id AND COALESCE(c.duracion_min, 0) <= 0;
    tipo_txt := 'clase en vivo';
  ELSIF _tipo = '1a1' THEN
    SELECT s.profesor_id, s.fecha, COALESCE(NULLIF(BTRIM(a.nombre_completo), ''), a.email, 'Estudiante')
      INTO pid, f, contexto_txt
    FROM public.sesiones_1a1 s
    LEFT JOIN public.profiles a ON a.id = s.alumna_id
    WHERE s.id = _referencia_id
      AND COALESCE(s.duracion_min, 0) <= 0
      AND LOWER(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada');
    tipo_txt := 'sesión 1 a 1';
  ELSE
    RAISE EXCEPTION 'Tipo de registro no válido';
  END IF;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'El registro ya no está pendiente o no existe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pagos_descuentos d
    WHERE d.referencia_tipo = _tipo AND d.referencia_id = _referencia_id
  ) THEN
    RAISE EXCEPTION 'Esta incidencia ya tiene un descuento aplicado';
  END IF;

  motivo_txt := COALESCE(
    NULLIF(BTRIM(_motivo), ''),
    'No registró las horas de ' || tipo_txt || ' del ' || to_char(f, 'DD/MM/YYYY')
  );

  INSERT INTO public.pagos_descuentos(
    profesor_id, mes, anio, monto, motivo, referencia_tipo, referencia_id
  )
  VALUES(
    pid,
    EXTRACT(MONTH FROM f)::integer,
    EXTRACT(YEAR FROM f)::integer,
    _monto,
    motivo_txt,
    _tipo,
    _referencia_id
  )
  RETURNING id INTO descuento_id;

  cuerpo_txt := 'Se registró un descuento de $' || trim(to_char(_monto, 'FM999999990.00')) || '. Motivo: ' || motivo_txt || '.';

  INSERT INTO public.notificaciones(usuario_id, tipo, titulo, cuerpo, url, referencia_id, actor_id)
  VALUES(pid, 'descuento_horas', 'Descuento registrado', cuerpo_txt, '/mis-clases-asignadas', _referencia_id, auth.uid());

  RETURN descuento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_descuento_registro_pendiente(text, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_descuento_registro_pendiente(text, uuid, numeric, text) TO authenticated, service_role;
