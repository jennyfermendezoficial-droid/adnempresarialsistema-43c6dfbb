-- La alumna no es responsable de resolver sesiones 1 a 1 sin duración.
-- Retira únicamente las notificaciones históricas creadas por esa lógica equivocada.
DELETE FROM public.notificaciones
WHERE tipo = 'sesion_pendiente_reprogramar';

-- Agenda a Norma Cecilia Guaman Yauri con Erick Silva
-- para el 10 de septiembre de 2026 a las 15:00, solo si sigue siendo válido.
DO $$
DECLARE
  v_alumna constant uuid := 'bbb809bd-b24a-4606-9c01-7a60f233e433'::uuid;
  v_profesor constant uuid := 'd0c055a2-1002-460e-a42c-4a65a9e59303'::uuid;
  v_fecha constant date := date '2026-09-10';
  v_hora constant time := time '15:00';
  v_activas_dia integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = v_alumna
      AND ur.role::text = 'usuario'
  ) THEN
    RAISE NOTICE 'No se encontró la cuenta de Norma con rol usuario; no se creó la sesión.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = v_profesor
      AND ur.role::text IN ('soporte', 'admin')
  ) THEN
    RAISE NOTICE 'No se encontró la cuenta de Erick con rol profesor; no se creó la sesión.';
    RETURN;
  END IF;

  -- Idempotencia: si ya existe exactamente esta reserva, no duplicar.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND s.hora_inicio = v_hora
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada','cancelado','anulada','anulado','no_realizada','no realizado'
      )
  ) THEN
    RAISE NOTICE 'La sesión Norma-Erick del 10/09/2026 a las 15:00 ya existe.';
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_activas_dia
  FROM public.sesiones_1a1 s
  WHERE s.alumna_id = v_alumna
    AND s.fecha = v_fecha
    AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
      'cancelada','cancelado','anulada','anulado','no_realizada','no realizado'
    );

  IF v_activas_dia >= 2 THEN
    RAISE NOTICE 'Norma ya tiene el máximo de 2 sesiones activas el 10/09/2026; no se creó otra.';
    RETURN;
  END IF;

  -- Norma no puede estar con otro profesor a la misma hora.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada','cancelado','anulada','anulado','no_realizada','no realizado'
      )
      AND s.hora_inicio < (v_hora + interval '1 hour')::time
      AND coalesce(s.hora_fin, (s.hora_inicio + interval '1 hour')::time) > v_hora
  ) THEN
    RAISE NOTICE 'Norma ya tiene una sesión que se cruza con las 15:00; no se creó la reserva.';
    RETURN;
  END IF;

  -- Erick tampoco puede tener otra alumna a la misma hora.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada','cancelado','anulada','anulado','no_realizada','no realizado'
      )
      AND s.hora_inicio < (v_hora + interval '1 hour')::time
      AND coalesce(s.hora_fin, (s.hora_inicio + interval '1 hour')::time) > v_hora
  ) THEN
    RAISE NOTICE 'Erick ya tiene una sesión que se cruza con las 15:00; no se creó la reserva.';
    RETURN;
  END IF;

  -- Mantener una sola sesión activa por profesor para la misma alumna en el día.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada','cancelado','anulada','anulado','no_realizada','no realizado'
      )
  ) THEN
    RAISE NOTICE 'Norma ya tiene otra sesión activa con Erick ese día; no se creó otra.';
    RETURN;
  END IF;

  INSERT INTO public.sesiones_1a1 (
    alumna_id,
    profesor_id,
    fecha,
    hora_inicio,
    hora_fin,
    estado,
    motivo
  )
  VALUES (
    v_alumna,
    v_profesor,
    v_fecha,
    v_hora,
    NULL,
    'confirmada',
    'Sesión agendada por administración'
  );

  RAISE NOTICE 'Sesión Norma-Erick agendada para el 10/09/2026 a las 15:00.';
END
$$;

NOTIFY pgrst, 'reload schema';
