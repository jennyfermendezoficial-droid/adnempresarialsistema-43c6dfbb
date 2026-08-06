-- 1) Separar cursos de clases en vivo
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'curso';
UPDATE public.cursos SET tipo = 'clase_en_vivo';
ALTER TABLE public.cursos DROP CONSTRAINT IF EXISTS cursos_tipo_check;
ALTER TABLE public.cursos ADD CONSTRAINT cursos_tipo_check CHECK (tipo IN ('curso','clase_en_vivo'));

-- 2) Mayor precision en horas
ALTER TABLE public.horas_trabajadas ALTER COLUMN horas TYPE numeric(10,4);

-- 3) Funciones con hora inicio/fin y calculo al minuto
CREATE OR REPLACE FUNCTION public.registrar_duracion_clase(_clase_id uuid, _duracion_min integer, _hora_inicio time DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _c public.clases_en_vivo%ROWTYPE;
  _tarifa numeric;
  _ini time;
  _fin time;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _duracion_min IS NULL OR _duracion_min <= 0 OR _duracion_min > 600 THEN
    RAISE EXCEPTION 'Duracion invalida';
  END IF;

  SELECT * INTO _c FROM public.clases_en_vivo WHERE id = _clase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase no encontrada'; END IF;

  IF NOT (_c.profesor_id = _uid OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _c.profesor_id IS NULL THEN RAISE EXCEPTION 'La clase no tiene profesor asignado'; END IF;

  _ini := COALESCE(_hora_inicio, _c.hora_inicio);
  _fin := (_ini + make_interval(mins => _duracion_min))::time;

  UPDATE public.clases_en_vivo
    SET duracion_min = _duracion_min,
        hora_inicio = _ini,
        hora_fin = _fin,
        finalizada_at = now()
    WHERE id = _clase_id;

  SELECT tarifa_hora_clase INTO _tarifa FROM public.profiles WHERE id = _c.profesor_id;
  _tarifa := COALESCE(_tarifa, 0);

  DELETE FROM public.horas_trabajadas WHERE referencia_id = _clase_id AND tipo = 'clase';
  INSERT INTO public.horas_trabajadas (profesor_id, fecha, tipo, horas, tarifa, monto, referencia_id)
  VALUES (
    _c.profesor_id, _c.fecha, 'clase',
    ROUND(_duracion_min::numeric / 60, 4), _tarifa,
    ROUND(_tarifa * _duracion_min::numeric / 60, 2), _clase_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_duracion_sesion(_sesion_id uuid, _duracion_min integer, _hora_inicio time DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _s public.sesiones_1a1%ROWTYPE;
  _tarifa numeric;
  _ini time;
  _fin time;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _duracion_min IS NULL OR _duracion_min <= 0 OR _duracion_min > 600 THEN
    RAISE EXCEPTION 'Duracion invalida';
  END IF;

  SELECT * INTO _s FROM public.sesiones_1a1 WHERE id = _sesion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesion no encontrada'; END IF;

  IF NOT (_s.profesor_id = _uid OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  _ini := COALESCE(_hora_inicio, _s.hora_inicio);
  _fin := (_ini + make_interval(mins => _duracion_min))::time;

  UPDATE public.sesiones_1a1
    SET duracion_min = _duracion_min,
        hora_inicio = _ini,
        hora_fin = _fin,
        estado = 'finalizada',
        finalizada_at = now()
    WHERE id = _sesion_id;

  SELECT tarifa_sesion_1a1 INTO _tarifa FROM public.profiles WHERE id = _s.profesor_id;
  _tarifa := COALESCE(_tarifa, 0);

  DELETE FROM public.horas_trabajadas WHERE referencia_id = _sesion_id AND tipo = 'sesion_1a1';
  INSERT INTO public.horas_trabajadas (profesor_id, fecha, tipo, horas, tarifa, monto, referencia_id)
  VALUES (
    _s.profesor_id, _s.fecha, 'sesion_1a1',
    ROUND(_duracion_min::numeric / 60, 4), _tarifa,
    ROUND(_tarifa * _duracion_min::numeric / 60, 2), _sesion_id
  );
END;
$function$;

-- 4) Recalcular registros existentes al minuto exacto
UPDATE public.horas_trabajadas h
SET horas = ROUND(c.duracion_min::numeric / 60, 4),
    monto = ROUND(h.tarifa * c.duracion_min::numeric / 60, 2)
FROM public.clases_en_vivo c
WHERE h.tipo = 'clase' AND h.referencia_id = c.id AND c.duracion_min IS NOT NULL;

UPDATE public.horas_trabajadas h
SET horas = ROUND(s.duracion_min::numeric / 60, 4),
    monto = ROUND(h.tarifa * s.duracion_min::numeric / 60, 2)
FROM public.sesiones_1a1 s
WHERE h.tipo = 'sesion_1a1' AND h.referencia_id = s.id AND s.duracion_min IS NOT NULL;