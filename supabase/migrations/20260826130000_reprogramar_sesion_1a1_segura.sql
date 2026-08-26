-- Reprogramación segura de una sesión 1 a 1 por parte de la alumna.
-- Modifica la MISMA sesión y solo permite moverla exactamente al día siguiente.

CREATE OR REPLACE FUNCTION public.reprogramar_mi_sesion_1a1(
  _sesion_id uuid,
  _fecha date,
  _hora_inicio time
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sesion public.sesiones_1a1%ROWTYPE;
  v_dia integer;
  v_fin timestamp;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_1a1
  WHERE id = _sesion_id
    AND alumna_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sesión no existe o no te pertenece';
  END IF;

  IF COALESCE(v_sesion.duracion_min, 0) > 0
     OR lower(COALESCE(v_sesion.estado, 'confirmada')) IN ('finalizada','cancelada','cancelado','anulada','anulado') THEN
    RAISE EXCEPTION 'Esta sesión ya fue resuelta y no puede reprogramarse';
  END IF;

  -- Consideramos una hora cuando todavía no existe hora_fin real.
  v_fin := (v_sesion.fecha::timestamp + v_sesion.hora_inicio)
           + CASE
               WHEN v_sesion.hora_fin IS NOT NULL
                 THEN (v_sesion.hora_fin - v_sesion.hora_inicio)
               ELSE interval '60 minutes'
             END;

  IF v_fin > (now() AT TIME ZONE 'America/Guayaquil') THEN
    RAISE EXCEPTION 'La sesión todavía no ha terminado';
  END IF;

  IF _fecha <> (v_sesion.fecha + 1) THEN
    RAISE EXCEPTION 'Solo puedes mover la sesión al día siguiente';
  END IF;

  IF _fecha < (now() AT TIME ZONE 'America/Guayaquil')::date THEN
    RAISE EXCEPTION 'Ya pasó el único día permitido para reprogramar esta sesión';
  END IF;

  v_dia := EXTRACT(ISODOW FROM _fecha)::integer;
  IF v_dia NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'El día siguiente no está habilitado para sesiones 1 a 1';
  END IF;

  -- Si existe configuración explícita de no disponibilidad para ese día, bloquear.
  IF EXISTS (
    SELECT 1
    FROM public.disponibilidad d
    WHERE d.profesor_id = v_sesion.profesor_id
      AND d.dia_semana = (v_dia - 1)
      AND d.activo = false
  ) THEN
    RAISE EXCEPTION 'El profesor no está disponible el día siguiente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.profesor_id = v_sesion.profesor_id
      AND s.fecha = _fecha
      AND s.hora_inicio = _hora_inicio
      AND s.id <> _sesion_id
      AND lower(COALESCE(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada','anulado')
  ) THEN
    RAISE EXCEPTION 'Ese horario ya está ocupado';
  END IF;

  UPDATE public.sesiones_1a1
  SET
    fecha = _fecha,
    hora_inicio = _hora_inicio,
    hora_fin = NULL,
    duracion_min = NULL,
    estado = 'confirmada'
  WHERE id = _sesion_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reprogramar_mi_sesion_1a1(uuid,date,time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reprogramar_mi_sesion_1a1(uuid,date,time) TO authenticated;

NOTIFY pgrst, 'reload schema';
