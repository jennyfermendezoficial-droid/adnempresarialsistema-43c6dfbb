-- Control de horas reales de profesores.
-- La exigencia estricta inicia con actividades del 2026-08-18 en adelante;
-- lo anterior se conserva como histórico y no genera incidencias nuevas.

CREATE TABLE IF NOT EXISTS public.incidencias_registro_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('clase','1a1')),
  referencia_id uuid NOT NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_duda','resuelta')),
  motivo_profesor text,
  resuelta boolean NOT NULL DEFAULT false,
  resuelta_at timestamptz,
  notificado_lider boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, referencia_id)
);

CREATE INDEX IF NOT EXISTS incidencias_horas_profesor_idx
  ON public.incidencias_registro_horas (profesor_id, resuelta, fecha);

ALTER TABLE public.incidencias_registro_horas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incidencias_horas_select" ON public.incidencias_registro_horas;
DROP POLICY IF EXISTS "incidencias_horas_propias_o_admin" ON public.incidencias_registro_horas;
CREATE POLICY "incidencias_horas_propias_o_admin"
ON public.incidencias_registro_horas
FOR SELECT TO authenticated
USING (
  profesor_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

GRANT SELECT ON public.incidencias_registro_horas TO authenticated;
GRANT ALL ON public.incidencias_registro_horas TO service_role;

CREATE OR REPLACE FUNCTION public.sincronizar_incidencias_horas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cantidad integer := 0;
  _antiguas integer := 0;
  _fecha_antigua date;
  _admins uuid[];
  _hoy date := (now() AT TIME ZONE 'America/Guayaquil')::date;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'soporte'::public.app_role) THEN
    RETURN jsonb_build_object('cantidad', 0, 'antiguas', 0, 'fecha_antigua', null);
  END IF;

  INSERT INTO public.incidencias_registro_horas
    (profesor_id, tipo, referencia_id, fecha, hora_inicio, estado)
  SELECT _uid, 'clase', c.id, c.fecha, c.hora_inicio,
         CASE WHEN c.fecha <= _hoy - 3 THEN 'en_duda' ELSE 'pendiente' END
  FROM public.clases_en_vivo c
  WHERE c.profesor_id = _uid
    AND c.duracion_min IS NULL
    AND c.fecha >= DATE '2026-08-18'
    AND c.fecha < _hoy
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false,
        resuelta_at = null,
        estado = CASE
          WHEN EXCLUDED.fecha <= _hoy - 3 THEN 'en_duda'
          ELSE 'pendiente'
        END;

  INSERT INTO public.incidencias_registro_horas
    (profesor_id, tipo, referencia_id, fecha, hora_inicio, estado)
  SELECT _uid, '1a1', s.id, s.fecha, s.hora_inicio,
         CASE WHEN s.fecha <= _hoy - 3 THEN 'en_duda' ELSE 'pendiente' END
  FROM public.sesiones_1a1 s
  WHERE s.profesor_id = _uid
    AND s.duracion_min IS NULL
    AND COALESCE(s.estado, '') <> 'cancelada'
    AND s.fecha >= DATE '2026-08-18'
    AND s.fecha < _hoy
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false,
        resuelta_at = null,
        estado = CASE
          WHEN EXCLUDED.fecha <= _hoy - 3 THEN 'en_duda'
          ELSE 'pendiente'
        END;

  -- Una incidencia se resuelve automáticamente en cuanto existe duración real
  -- o la sesión dejó de ser válida (p. ej. fue cancelada).
  UPDATE public.incidencias_registro_horas i
  SET resuelta = true,
      resuelta_at = now(),
      estado = 'resuelta'
  WHERE i.profesor_id = _uid
    AND i.resuelta = false
    AND (
      (i.tipo = 'clase' AND NOT EXISTS (
        SELECT 1
        FROM public.clases_en_vivo c
        WHERE c.id = i.referencia_id
          AND c.duracion_min IS NULL
      ))
      OR
      (i.tipo = '1a1' AND NOT EXISTS (
        SELECT 1
        FROM public.sesiones_1a1 s
        WHERE s.id = i.referencia_id
          AND s.duracion_min IS NULL
          AND COALESCE(s.estado, '') <> 'cancelada'
      ))
    );

  SELECT count(*), min(fecha), count(*) FILTER (WHERE fecha <= _hoy - 3)
  INTO _cantidad, _fecha_antigua, _antiguas
  FROM public.incidencias_registro_horas
  WHERE profesor_id = _uid
    AND resuelta = false;

  -- Notifica una sola vez al Líder si hay acumulación importante o atraso >= 3 días.
  IF (_cantidad >= 3 OR _antiguas > 0) AND EXISTS (
    SELECT 1
    FROM public.incidencias_registro_horas
    WHERE profesor_id = _uid
      AND resuelta = false
      AND notificado_lider = false
  ) THEN
    SELECT array_agg(user_id)
    INTO _admins
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role;

    IF array_length(_admins, 1) IS NOT NULL THEN
      PERFORM public.notificar(
        _admins,
        'registro_horas',
        'Horas pendientes de registrar',
        public.nombre_usuario(_uid) || ' tiene ' || _cantidad || ' clases/sesiones sin duración real registrada.',
        '/pagos',
        _uid,
        NULL
      );
    END IF;

    UPDATE public.incidencias_registro_horas
    SET notificado_lider = true
    WHERE profesor_id = _uid
      AND resuelta = false
      AND notificado_lider = false;
  END IF;

  RETURN jsonb_build_object(
    'cantidad', _cantidad,
    'antiguas', _antiguas,
    'fecha_antigua', _fecha_antigua
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_incidencias_horas() TO authenticated;

CREATE OR REPLACE FUNCTION public.sincronizar_incidencias_horas_equipo()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _admins uuid[];
  _fila record;
  _alertas integer := 0;
  _hoy date := (now() AT TIME ZONE 'America/Guayaquil')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.incidencias_registro_horas
    (profesor_id, tipo, referencia_id, fecha, hora_inicio, estado)
  SELECT c.profesor_id, 'clase', c.id, c.fecha, c.hora_inicio,
         CASE WHEN c.fecha <= _hoy - 3 THEN 'en_duda' ELSE 'pendiente' END
  FROM public.clases_en_vivo c
  JOIN public.user_roles ur
    ON ur.user_id = c.profesor_id
   AND ur.role = 'soporte'::public.app_role
  WHERE c.profesor_id IS NOT NULL
    AND c.duracion_min IS NULL
    AND c.fecha >= DATE '2026-08-18'
    AND c.fecha < _hoy
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false,
        resuelta_at = null,
        estado = CASE
          WHEN EXCLUDED.fecha <= _hoy - 3 THEN 'en_duda'
          ELSE 'pendiente'
        END;

  INSERT INTO public.incidencias_registro_horas
    (profesor_id, tipo, referencia_id, fecha, hora_inicio, estado)
  SELECT s.profesor_id, '1a1', s.id, s.fecha, s.hora_inicio,
         CASE WHEN s.fecha <= _hoy - 3 THEN 'en_duda' ELSE 'pendiente' END
  FROM public.sesiones_1a1 s
  JOIN public.user_roles ur
    ON ur.user_id = s.profesor_id
   AND ur.role = 'soporte'::public.app_role
  WHERE s.duracion_min IS NULL
    AND COALESCE(s.estado, '') <> 'cancelada'
    AND s.fecha >= DATE '2026-08-18'
    AND s.fecha < _hoy
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false,
        resuelta_at = null,
        estado = CASE
          WHEN EXCLUDED.fecha <= _hoy - 3 THEN 'en_duda'
          ELSE 'pendiente'
        END;

  UPDATE public.incidencias_registro_horas i
  SET resuelta = true,
      resuelta_at = now(),
      estado = 'resuelta'
  WHERE i.resuelta = false
    AND (
      (i.tipo = 'clase' AND NOT EXISTS (
        SELECT 1 FROM public.clases_en_vivo c
        WHERE c.id = i.referencia_id AND c.duracion_min IS NULL
      ))
      OR
      (i.tipo = '1a1' AND NOT EXISTS (
        SELECT 1 FROM public.sesiones_1a1 s
        WHERE s.id = i.referencia_id
          AND s.duracion_min IS NULL
          AND COALESCE(s.estado, '') <> 'cancelada'
      ))
    );

  SELECT array_agg(user_id)
  INTO _admins
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role;

  FOR _fila IN
    SELECT profesor_id,
           count(*) AS cantidad,
           count(*) FILTER (WHERE fecha <= _hoy - 3) AS antiguas
    FROM public.incidencias_registro_horas
    WHERE resuelta = false
    GROUP BY profesor_id
    HAVING count(*) >= 3
       OR count(*) FILTER (WHERE fecha <= _hoy - 3) > 0
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.incidencias_registro_horas
      WHERE profesor_id = _fila.profesor_id
        AND resuelta = false
        AND notificado_lider = false
    ) THEN
      IF array_length(_admins, 1) IS NOT NULL THEN
        PERFORM public.notificar(
          _admins,
          'registro_horas',
          'Horas pendientes de registrar',
          public.nombre_usuario(_fila.profesor_id) || ' tiene ' || _fila.cantidad || ' clases/sesiones sin duración real registrada.',
          '/pagos',
          _fila.profesor_id,
          NULL
        );
      END IF;

      UPDATE public.incidencias_registro_horas
      SET notificado_lider = true
      WHERE profesor_id = _fila.profesor_id
        AND resuelta = false
        AND notificado_lider = false;

      _alertas := _alertas + 1;
    END IF;
  END LOOP;

  RETURN _alertas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_incidencias_horas_equipo() TO authenticated;
