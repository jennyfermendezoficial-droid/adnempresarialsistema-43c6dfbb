-- Compatibilidad con el resumen existente de Pagos e informes.
-- La interfaz nueva usa detalle_horas_pendientes; este RPC mantiene el resumen
-- por profesor para los cálculos/indicadores ya existentes.

CREATE OR REPLACE FUNCTION public.revisar_horas_pendientes(_profesor_id uuid DEFAULT NULL)
RETURNS TABLE(profesor_id uuid, pendientes integer, dias_max integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  target uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF public.puede_pagos(caller) THEN
    target := _profesor_id;
  ELSE
    target := caller;
  END IF;

  RETURN QUERY
  WITH pendientes_raw AS (
    SELECT c.profesor_id, c.fecha
    FROM public.clases_en_vivo c
    WHERE (target IS NULL OR c.profesor_id = target)
      AND c.profesor_id IS NOT NULL
      AND COALESCE(c.duracion_min, 0) <= 0
      AND (
        c.finalizada_at IS NOT NULL
        OR c.fecha < CURRENT_DATE
        OR (c.fecha = CURRENT_DATE AND c.hora_fin < LOCALTIME)
      )

    UNION ALL

    SELECT s.profesor_id, s.fecha
    FROM public.sesiones_1a1 s
    WHERE (target IS NULL OR s.profesor_id = target)
      AND COALESCE(s.duracion_min, 0) <= 0
      AND LOWER(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada')
      AND (
        s.finalizada_at IS NOT NULL
        OR s.fecha < CURRENT_DATE
        OR (s.fecha = CURRENT_DATE AND COALESCE(s.hora_fin, s.hora_inicio) < LOCALTIME)
      )
  )
  SELECT p.profesor_id,
         COUNT(*)::integer AS pendientes,
         COALESCE(MAX(CURRENT_DATE - p.fecha), 0)::integer AS dias_max
  FROM pendientes_raw p
  GROUP BY p.profesor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revisar_horas_pendientes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_horas_pendientes(uuid) TO authenticated, service_role;
