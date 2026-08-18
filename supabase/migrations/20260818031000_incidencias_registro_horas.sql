CREATE TABLE IF NOT EXISTS public.incidencias_registro_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('clase','1a1')),
  referencia_id uuid NOT NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  resuelta boolean NOT NULL DEFAULT false,
  resuelta_at timestamptz,
  notificado_lider boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, referencia_id)
);

CREATE INDEX IF NOT EXISTS incidencias_horas_profesor_idx
  ON public.incidencias_registro_horas (profesor_id, resuelta, fecha);

GRANT SELECT ON public.incidencias_registro_horas TO authenticated;
GRANT ALL ON public.incidencias_registro_horas TO service_role;
ALTER TABLE public.incidencias_registro_horas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidencias_horas_select" ON public.incidencias_registro_horas
FOR SELECT TO authenticated
USING (
  profesor_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'soporte'::public.app_role)
);

CREATE TRIGGER incidencias_registro_horas_updated_at
BEFORE UPDATE ON public.incidencias_registro_horas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'soporte'::public.app_role) THEN
    RETURN jsonb_build_object('cantidad', 0, 'antiguas', 0, 'fecha_antigua', null);
  END IF;

  -- Se considera pendiente desde el día siguiente; no se molesta al profesor
  -- mientras todavía está transcurriendo el día de la clase/sesión.
  INSERT INTO public.incidencias_registro_horas (profesor_id, tipo, referencia_id, fecha, hora_inicio)
  SELECT _uid, 'clase', c.id, c.fecha, c.hora_inicio
  FROM public.clases_en_vivo c
  WHERE c.profesor_id = _uid
    AND c.duracion_min IS NULL
    AND c.fecha < (now() AT TIME ZONE 'America/Guayaquil')::date
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false, resuelta_at = null;

  INSERT INTO public.incidencias_registro_horas (profesor_id, tipo, referencia_id, fecha, hora_inicio)
  SELECT _uid, '1a1', s.id, s.fecha, s.hora_inicio
  FROM public.sesiones_1a1 s
  WHERE s.profesor_id = _uid
    AND s.duracion_min IS NULL
    AND COALESCE(s.estado, '') <> 'cancelada'
    AND s.fecha < (now() AT TIME ZONE 'America/Guayaquil')::date
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false, resuelta_at = null;

  -- Cierra automáticamente la incidencia cuando la duración ya fue registrada
  -- o cuando el registro original dejó de existir (por ejemplo, una cancelación válida).
  UPDATE public.incidencias_registro_horas i
  SET resuelta = true, resuelta_at = now()
  WHERE i.profesor_id = _uid
    AND i.resuelta = false
    AND (
      (i.tipo = 'clase' AND NOT EXISTS (
        SELECT 1 FROM public.clases_en_vivo c
        WHERE c.id = i.referencia_id AND c.duracion_min IS NULL
      ))
      OR
      (i.tipo = '1a1' AND NOT EXISTS (
        SELECT 1 FROM public.sesiones_1a1 s
        WHERE s.id = i.referencia_id AND s.duracion_min IS NULL AND COALESCE(s.estado, '') <> 'cancelada'
      ))
    );

  SELECT count(*), min(fecha), count(*) FILTER (
    WHERE fecha <= (now() AT TIME ZONE 'America/Guayaquil')::date - 3
  )
  INTO _cantidad, _fecha_antigua, _antiguas
  FROM public.incidencias_registro_horas
  WHERE profesor_id = _uid AND resuelta = false;

  -- Alerta al Líder una sola vez por las incidencias graves: 3 o más pendientes
  -- o alguna pendiente de al menos 3 días.
  IF (_cantidad >= 3 OR _antiguas > 0) AND EXISTS (
    SELECT 1 FROM public.incidencias_registro_horas
    WHERE profesor_id = _uid AND resuelta = false AND notificado_lider = false
  ) THEN
    SELECT array_agg(user_id) INTO _admins
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role;

    IF array_length(_admins, 1) IS NOT NULL THEN
      PERFORM public.notificar(
        _admins,
        'registro_horas',
        'Horas pendientes de registrar',
        public.nombre_usuario(_uid) || ' tiene ' || _cantidad || ' clases/sesiones sin duración registrada.',
        '/pagos',
        _uid,
        NULL
      );
    END IF;

    UPDATE public.incidencias_registro_horas
    SET notificado_lider = true
    WHERE profesor_id = _uid AND resuelta = false AND notificado_lider = false;
  END IF;

  RETURN jsonb_build_object(
    'cantidad', _cantidad,
    'antiguas', _antiguas,
    'fecha_antigua', _fecha_antigua
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_incidencias_horas() TO authenticated;
