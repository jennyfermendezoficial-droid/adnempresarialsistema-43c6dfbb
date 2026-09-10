-- Agenda una sesión 1 a 1 para mañana entre la alumna Norma Waman/Huaman/Guamán
-- y el profesor Erick. No inventa UUIDs: resuelve ambas cuentas por nombre.
-- Si ya existe una sesión activa entre ambos para mañana, no duplica.

DO $$
DECLARE
  v_alumna uuid;
  v_profesor uuid;
  v_fecha date := (timezone('America/Guayaquil', now()))::date + 1;
  v_inicio time;
  v_fin time;
BEGIN
  -- Normaliza acentos básicos para tolerar Waman / Huaman / Guamán.
  SELECT p.id
    INTO v_alumna
  FROM public.profiles p
  WHERE translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%norma%'
    AND (
      translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%waman%'
      OR translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%huaman%'
      OR translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%guaman%'
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role::text = 'usuario'
    )
  ORDER BY p.created_at ASC
  LIMIT 1;

  SELECT p.id
    INTO v_profesor
  FROM public.profiles p
  WHERE (
      translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%erick%'
      OR translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%eric%'
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role::text IN ('soporte', 'admin')
    )
  ORDER BY
    CASE WHEN translate(lower(coalesce(p.nombre_completo, '')), 'áéíóúüñ', 'aeiouun') LIKE '%troya%' THEN 0 ELSE 1 END,
    p.created_at ASC
  LIMIT 1;

  IF v_alumna IS NULL THEN
    RAISE NOTICE 'No se encontró una alumna cuyo nombre coincida con Norma Waman/Huaman/Guamán. No se creó ninguna sesión.';
    RETURN;
  END IF;

  IF v_profesor IS NULL THEN
    RAISE NOTICE 'No se encontró un profesor Erick/Eric. No se creó ninguna sesión.';
    RETURN;
  END IF;

  -- Si ya hay una sesión activa entre ambos mañana, no crear otra.
  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = v_alumna
      AND s.profesor_id = v_profesor
      AND s.fecha = v_fecha
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada','anulado','no_realizada','no realizado')
  ) THEN
    RAISE NOTICE 'Norma ya tiene una sesión activa con Erick para mañana. No se creó duplicado.';
    RETURN;
  END IF;

  -- Primero: buscar el primer bloque libre de 1 hora dentro de la disponibilidad real de Erick.
  SELECT gs::time, (gs + interval '1 hour')::time
    INTO v_inicio, v_fin
  FROM public.disponibilidad d
  CROSS JOIN LATERAL generate_series(
    v_fecha + d.hora_inicio,
    v_fecha + d.hora_fin - interval '1 hour',
    interval '1 hour'
  ) AS gs
  WHERE d.profesor_id = v_profesor
    AND d.activo = true
    AND d.dia_semana = (extract(isodow from v_fecha)::int - 1)
    AND NOT EXISTS (
      SELECT 1
      FROM public.sesiones_1a1 s
      WHERE s.profesor_id = v_profesor
        AND s.fecha = v_fecha
        AND lower(coalesce(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada','anulado','no_realizada','no realizado')
        AND s.hora_inicio < (gs + interval '1 hour')::time
        AND s.hora_fin > gs::time
    )
  ORDER BY gs
  LIMIT 1;

  -- Respaldo: si Erick no tiene disponibilidad cargada para mañana,
  -- buscar el primer bloque libre entre 08:00 y 18:00.
  IF v_inicio IS NULL THEN
    SELECT gs::time, (gs + interval '1 hour')::time
      INTO v_inicio, v_fin
    FROM generate_series(
      v_fecha + time '08:00',
      v_fecha + time '17:00',
      interval '1 hour'
    ) AS gs
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.sesiones_1a1 s
      WHERE s.profesor_id = v_profesor
        AND s.fecha = v_fecha
        AND lower(coalesce(s.estado, 'confirmada')) NOT IN ('cancelada','cancelado','anulada','anulado','no_realizada','no realizado')
        AND s.hora_inicio < (gs + interval '1 hour')::time
        AND s.hora_fin > gs::time
    )
    ORDER BY gs
    LIMIT 1;
  END IF;

  IF v_inicio IS NULL OR v_fin IS NULL THEN
    RAISE NOTICE 'No se encontró ningún horario libre para Erick mañana. No se creó ninguna sesión.';
    RETURN;
  END IF;

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
    v_fin,
    'confirmada'
  );

  RAISE NOTICE 'Sesión 1 a 1 agendada correctamente para mañana a las % con Erick.', v_inicio;
END
$$;

NOTIFY pgrst, 'reload schema';
