ALTER TABLE public.sesiones_1a1 ADD COLUMN IF NOT EXISTS duracion_min integer;
ALTER TABLE public.sesiones_1a1 ALTER COLUMN hora_fin DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_duracion_sesion(_sesion_id uuid, _duracion_min integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.sesiones_1a1%ROWTYPE;
  _tarifa numeric;
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

  _fin := (_s.hora_inicio + make_interval(mins => _duracion_min))::time;

  UPDATE public.sesiones_1a1
    SET duracion_min = _duracion_min,
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
    ROUND(_duracion_min::numeric / 60, 2), _tarifa,
    ROUND((_duracion_min::numeric / 60) * _tarifa, 2), _sesion_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_duracion_sesion(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_duracion_sesion(uuid, integer) TO authenticated;