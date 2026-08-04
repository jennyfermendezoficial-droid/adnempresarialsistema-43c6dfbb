ALTER TABLE public.clases_en_vivo
  ADD COLUMN IF NOT EXISTS duracion_min integer,
  ADD COLUMN IF NOT EXISTS finalizada_at timestamptz;

CREATE OR REPLACE FUNCTION public.registrar_duracion_clase(_clase_id uuid, _duracion_min integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.clases_en_vivo%ROWTYPE;
  _tarifa numeric;
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

  _fin := (_c.hora_inicio + make_interval(mins => _duracion_min))::time;

  UPDATE public.clases_en_vivo
    SET duracion_min = _duracion_min,
        hora_fin = _fin,
        finalizada_at = now()
    WHERE id = _clase_id;

  SELECT tarifa_hora_clase INTO _tarifa FROM public.profiles WHERE id = _c.profesor_id;
  _tarifa := COALESCE(_tarifa, 0);

  DELETE FROM public.horas_trabajadas WHERE referencia_id = _clase_id AND tipo = 'clase';
  INSERT INTO public.horas_trabajadas (profesor_id, fecha, tipo, horas, tarifa, monto, referencia_id)
  VALUES (
    _c.profesor_id, _c.fecha, 'clase',
    ROUND(_duracion_min::numeric / 60, 2), _tarifa,
    ROUND((_duracion_min::numeric / 60) * _tarifa, 2), _clase_id
  );
END;
$$;