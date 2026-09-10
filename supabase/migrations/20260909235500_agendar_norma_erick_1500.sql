-- Agenda exclusivamente la sesión 1 a 1 solicitada para Norma con Erick.
-- Fecha/hora solicitadas: 2026-09-10 a las 15:00 (America/Guayaquil).
--
-- Seguridad:
-- - usa los UUID y nombres exactos ya identificados para no elegir otra cuenta;
-- - verifica los roles esperados;
-- - no duplica una reserva existente;
-- - respeta máximo 2 sesiones por alumna/día, una por profesor/día y sin cruces;
-- - respeta la ocupación del profesor;
-- - ante un conflicto concurrente, no rompe la migración: no inserta nada.
--
-- La reserva normal crea Zoom desde la aplicación antes del INSERT. Una migración
-- SQL no ejecuta esa función de servidor, por lo que aquí no se inventa ningún
-- zoom_link ni zoom_meeting_id.

DO $$
DECLARE
  v_alumna CONSTANT uuid := 'bbb809bd-b24a-4606-9c01-7a60f233e433'::uuid;
  v_profesor CONSTANT uuid := 'd0c055a2-1002-460e-a42c-4a65a9e59303'::uuid;
  v_fecha CONSTANT date := DATE '2026-09-10';
  v_inicio CONSTANT time := TIME '15:00';
  v_nombre_alumna text;
  v_nombre_profesor text;
  v_sesiones_alumna integer;
BEGIN
  SELECT p.nombre_completo
    INTO v_nombre_alumna
  FROM public.profiles p
  WHERE p.id = v_alumna
    AND p.nombre_completo = 'Norma Cecilia Guaman Yauri'
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role::text = 'usuario'
    );

  IF v_nombre_alumna IS NULL THEN
    RAISE NOTICE 'No se encontró la cuenta exacta y con rol usuario de Norma Cecilia Guaman Yauri. No se creó ninguna sesión.';
    RETURN;
  END IF;

  SELECT p.nombre_completo
    INTO v_nombre_profesor
  FROM public.profiles p
  WHERE p.id = v_profesor
    AND p.nombre_completo = 'Erick Silva'
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role::text = 'soporte'
    );

  IF v_nombre_profesor IS NULL THEN
    RAISE NOTICE 'No se encontró la cuenta exacta y con rol soporte de Erick Silva. No se creó ninguna sesión.';
    RETURN;
  END IF;

  -- Usa la misma llave de serialización del trigger de límite por alumna/día.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_alumna::text || '|' || v_fecha::text, 20260909)
  );

  -- Usa la misma llave del trigger que evita dos reservas simultáneas del profesor.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_profesor::text || '|' || v_fecha::text || '|' || v_inicio::text, 9147253)
  );

  -- Idempotencia: si ya existe exactamente esta reserva activa, no duplica.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND s.hora_inicio = v_inicio
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
      )
  ) THEN
    RAISE NOTICE 'La sesión exacta de Norma con Erick para 2026-09-10 15:00 ya existe. No se creó duplicado.';
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_sesiones_alumna
  FROM public.sesiones_1a1 s
  WHERE s.alumna_id = v_alumna
    AND s.fecha = v_fecha
    AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
      'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
    );

  IF v_sesiones_alumna >= 2 THEN
    RAISE NOTICE 'Norma ya tiene el máximo de 2 sesiones activas el 2026-09-10. No se creó la sesión con Erick.';
    RETURN;
  END IF;

  -- Conserva una sola sesión activa con el mismo profesor durante el día.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
      )
  ) THEN
    RAISE NOTICE 'Norma ya tiene otra sesión activa con Erick el 2026-09-10. No se creó una segunda sesión.';
    RETURN;
  END IF;

  -- Norma no puede estar con otro profesor dentro del bloque 15:00-16:00.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
      )
      AND (s.fecha + s.hora_inicio) < ((v_fecha + v_inicio) + interval '60 minutes')
      AND (
        CASE
          WHEN s.hora_fin IS NULL THEN (s.fecha + s.hora_inicio) + interval '60 minutes'
          WHEN s.hora_fin < s.hora_inicio THEN (s.fecha + s.hora_fin) + interval '1 day'
          ELSE s.fecha + s.hora_fin
        END
      ) > (v_fecha + v_inicio)
  ) THEN
    RAISE NOTICE 'Norma ya tiene una sesión que se cruza con 15:00-16:00 el 2026-09-10. No se creó la sesión.';
    RETURN;
  END IF;

  -- Erick tampoco puede tener otra sesión que se cruce con ese bloque.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
      )
      AND (s.fecha + s.hora_inicio) < ((v_fecha + v_inicio) + interval '60 minutes')
      AND (
        CASE
          WHEN s.hora_fin IS NULL THEN (s.fecha + s.hora_inicio) + interval '60 minutes'
          WHEN s.hora_fin < s.hora_inicio THEN (s.fecha + s.hora_fin) + interval '1 day'
          ELSE s.fecha + s.hora_fin
        END
      ) > (v_fecha + v_inicio)
  ) THEN
    RAISE NOTICE 'Erick ya tiene una sesión que se cruza con 15:00-16:00 el 2026-09-10. No se creó la sesión.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.sesiones_1a1 (
      alumna_id,
      profesor_id,
      fecha,
      hora_inicio,
      hora_fin,
      estado
    )
    VALUES (
      v_alumna,
      v_profesor,
      v_fecha,
      v_inicio,
      NULL,
      'confirmada'
    );

    RAISE NOTICE 'Sesión 1 a 1 de Norma con Erick agendada para 2026-09-10 a las 15:00.';
  EXCEPTION
    WHEN unique_violation OR check_violation THEN
      RAISE NOTICE 'La sesión no se creó porque apareció un conflicto de reserva concurrente: %', SQLERRM;
  END;
END
$$;
