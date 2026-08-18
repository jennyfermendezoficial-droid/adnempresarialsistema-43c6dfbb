-- El Dueño/Líder revisa también las horas pendientes de todo el equipo al entrar.
-- Así una incidencia no depende de que el profesor vuelva a iniciar sesión.

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.incidencias_registro_horas (profesor_id, tipo, referencia_id, fecha, hora_inicio)
  SELECT c.profesor_id, 'clase', c.id, c.fecha, c.hora_inicio
  FROM public.clases_en_vivo c
  JOIN public.user_roles ur ON ur.user_id = c.profesor_id AND ur.role = 'soporte'::public.app_role
  WHERE c.profesor_id IS NOT NULL
    AND c.duracion_min IS NULL
    AND c.fecha < (now() AT TIME ZONE 'America/Guayaquil')::date
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false, resuelta_at = null;

  INSERT INTO public.incidencias_registro_horas (profesor_id, tipo, referencia_id, fecha, hora_inicio)
  SELECT s.profesor_id, '1a1', s.id, s.fecha, s.hora_inicio
  FROM public.sesiones_1a1 s
  JOIN public.user_roles ur ON ur.user_id = s.profesor_id AND ur.role = 'soporte'::public.app_role
  WHERE s.duracion_min IS NULL
    AND COALESCE(s.estado, '') <> 'cancelada'
    AND s.fecha < (now() AT TIME ZONE 'America/Guayaquil')::date
  ON CONFLICT (tipo, referencia_id) DO UPDATE
    SET resuelta = false, resuelta_at = null;

  UPDATE public.incidencias_registro_horas i
  SET resuelta = true, resuelta_at = now()
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

  SELECT array_agg(user_id) INTO _admins
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role;

  FOR _fila IN
    SELECT
      profesor_id,
      count(*) AS cantidad,
      min(fecha) AS fecha_antigua,
      count(*) FILTER (
        WHERE fecha <= (now() AT TIME ZONE 'America/Guayaquil')::date - 3
      ) AS antiguas
    FROM public.incidencias_registro_horas
    WHERE resuelta = false
    GROUP BY profesor_id
    HAVING count(*) >= 3
       OR count(*) FILTER (
         WHERE fecha <= (now() AT TIME ZONE 'America/Guayaquil')::date - 3
       ) > 0
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
          public.nombre_usuario(_fila.profesor_id) || ' tiene ' || _fila.cantidad || ' clases/sesiones sin duración registrada.',
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

-- Las incidencias dejan de ser visibles para todos los profesores.
-- Cada profesor ve las propias y los gestores autorizados pueden consultar el seguimiento.
DROP POLICY IF EXISTS "incidencias_horas_select" ON public.incidencias_registro_horas;
DROP POLICY IF EXISTS "incidencias_horas_propias_o_gestor" ON public.incidencias_registro_horas;
CREATE POLICY "incidencias_horas_propias_o_gestor" ON public.incidencias_registro_horas
FOR SELECT TO authenticated
USING (
  profesor_id = auth.uid()
  OR public.puede_gestionar_pagos()
);
