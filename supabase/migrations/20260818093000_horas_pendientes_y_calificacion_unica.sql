-- Evita calificaciones duplicadas para el mismo profesor/alumna/mes.
CREATE UNIQUE INDEX IF NOT EXISTS calificaciones_mensuales_unica_mes
ON public.calificaciones_mensuales (profesor_id, alumna_id, mes, anio);

-- Revisa horas pendientes. Un profesor normal solo revisa las suyas;
-- quienes gestionan Pagos (admin + Erick) pueden revisar todo el equipo.
CREATE OR REPLACE FUNCTION public.revisar_horas_pendientes(_profesor_id uuid DEFAULT NULL)
RETURNS TABLE(profesor_id uuid, pendientes integer, dias_max integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  target uuid;
  r record;
  admin_id uuid;
  titulo_txt text;
  cuerpo_txt text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF public.puede_pagos(caller) THEN
    target := _profesor_id;
  ELSE
    target := caller;
  END IF;

  FOR r IN
    WITH pendientes_raw AS (
      SELECT c.profesor_id, c.fecha
      FROM public.clases_en_vivo c
      WHERE (target IS NULL OR c.profesor_id = target)
        AND COALESCE(c.duracion_min, 0) <= 0
        AND (c.fecha < CURRENT_DATE OR (c.fecha = CURRENT_DATE AND COALESCE(c.hora_fin, c.hora_inicio) < LOCALTIME))
      UNION ALL
      SELECT s.profesor_id, s.fecha
      FROM public.sesiones_1a1 s
      WHERE (target IS NULL OR s.profesor_id = target)
        AND COALESCE(s.duracion_min, 0) <= 0
        AND lower(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada')
        AND (s.fecha < CURRENT_DATE OR (s.fecha = CURRENT_DATE AND COALESCE(s.hora_fin, s.hora_inicio) < LOCALTIME))
    ), resumen AS (
      SELECT p.profesor_id,
             COUNT(*)::integer AS pendientes,
             COALESCE(MAX(CURRENT_DATE - p.fecha), 0)::integer AS dias_max
      FROM pendientes_raw p
      GROUP BY p.profesor_id
    )
    SELECT * FROM resumen
  LOOP
    IF r.pendientes >= 3 OR r.dias_max >= 3 THEN
      titulo_txt := 'Profesor con horas pendientes';
      cuerpo_txt := 'Tiene ' || r.pendientes || ' clase(s)/sesión(es) sin registrar duración. La más antigua lleva ' || r.dias_max || ' día(s).';
      FOR admin_id IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role
      LOOP
        UPDATE public.notificaciones n
           SET titulo = titulo_txt, cuerpo = cuerpo_txt, url = '/pagos', created_at = now()
         WHERE n.usuario_id = admin_id
           AND n.tipo = 'horas_pendientes'
           AND n.referencia_id = r.profesor_id
           AND n.leida = false;
        IF NOT FOUND THEN
          INSERT INTO public.notificaciones(usuario_id,tipo,titulo,cuerpo,url,referencia_id,actor_id)
          VALUES(admin_id,'horas_pendientes',titulo_txt,cuerpo_txt,'/pagos',r.profesor_id,r.profesor_id);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY
  WITH pendientes_raw AS (
    SELECT c.profesor_id, c.fecha
    FROM public.clases_en_vivo c
    WHERE (target IS NULL OR c.profesor_id = target)
      AND COALESCE(c.duracion_min, 0) <= 0
      AND (c.fecha < CURRENT_DATE OR (c.fecha = CURRENT_DATE AND COALESCE(c.hora_fin, c.hora_inicio) < LOCALTIME))
    UNION ALL
    SELECT s.profesor_id, s.fecha
    FROM public.sesiones_1a1 s
    WHERE (target IS NULL OR s.profesor_id = target)
      AND COALESCE(s.duracion_min, 0) <= 0
      AND lower(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada')
      AND (s.fecha < CURRENT_DATE OR (s.fecha = CURRENT_DATE AND COALESCE(s.hora_fin, s.hora_inicio) < LOCALTIME))
  )
  SELECT p.profesor_id, COUNT(*)::integer,
         COALESCE(MAX(CURRENT_DATE - p.fecha),0)::integer
  FROM pendientes_raw p
  GROUP BY p.profesor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revisar_horas_pendientes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_horas_pendientes(uuid) TO authenticated, service_role;
