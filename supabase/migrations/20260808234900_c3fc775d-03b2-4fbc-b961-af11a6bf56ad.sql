CREATE TABLE public.sesiones_canceladas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('1a1','clase')),
  referencia_id uuid,
  profesor_id uuid NOT NULL,
  contraparte_id uuid,
  titulo text,
  fecha date NOT NULL,
  hora_inicio time,
  estado text NOT NULL CHECK (estado IN ('cancelada','no_registrada')),
  razon text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sesiones_canceladas TO authenticated;
GRANT ALL ON public.sesiones_canceladas TO service_role;

ALTER TABLE public.sesiones_canceladas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven todas las canceladas"
ON public.sesiones_canceladas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR profesor_id = auth.uid());

CREATE POLICY "Profesor o admin registra cancelacion"
ON public.sesiones_canceladas FOR INSERT TO authenticated
WITH CHECK (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_sesiones_canceladas_prof_fecha ON public.sesiones_canceladas (profesor_id, fecha);

-- Cancelar sesion 1 a 1 con razon
CREATE OR REPLACE FUNCTION public.cancelar_sesion_1a1(_id uuid, _razon text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.sesiones_1a1%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _razon IS NULL OR length(btrim(_razon)) < 5 THEN
    RAISE EXCEPTION 'Debes indicar la razon (minimo 5 caracteres)';
  END IF;

  SELECT * INTO _s FROM public.sesiones_1a1 WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesion no encontrada'; END IF;
  IF NOT (_s.profesor_id = _uid OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _s.estado = 'finalizada' THEN
    RAISE EXCEPTION 'No se puede eliminar una sesion ya finalizada';
  END IF;

  INSERT INTO public.sesiones_canceladas
    (tipo, referencia_id, profesor_id, contraparte_id, fecha, hora_inicio, estado, razon, creado_por)
  VALUES ('1a1', _s.id, _s.profesor_id, _s.alumna_id, _s.fecha, _s.hora_inicio, 'cancelada', btrim(_razon), _uid);

  DELETE FROM public.sesiones_1a1 WHERE id = _id;
END; $$;

-- Cancelar clase en vivo con razon
CREATE OR REPLACE FUNCTION public.cancelar_clase(_id uuid, _razon text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.clases_en_vivo%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _razon IS NULL OR length(btrim(_razon)) < 5 THEN
    RAISE EXCEPTION 'Debes indicar la razon (minimo 5 caracteres)';
  END IF;

  SELECT * INTO _c FROM public.clases_en_vivo WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clase no encontrada'; END IF;
  IF NOT (_c.profesor_id = _uid OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF _c.duracion_min IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede eliminar una clase con duracion ya registrada';
  END IF;

  INSERT INTO public.sesiones_canceladas
    (tipo, referencia_id, profesor_id, contraparte_id, titulo, fecha, hora_inicio, estado, razon, creado_por)
  VALUES ('clase', _c.id, COALESCE(_c.profesor_id, _uid), NULL, _c.titulo, _c.fecha, _c.hora_inicio, 'cancelada', btrim(_razon), _uid);

  DELETE FROM public.clases_en_vivo WHERE id = _id;
END; $$;

-- Marcar como no registradas las que pasaron 7 dias sin duracion
CREATE OR REPLACE FUNCTION public.marcar_no_registradas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _limite date := (now() AT TIME ZONE 'America/Guayaquil')::date - 7;
  _n integer := 0;
  _c integer := 0;
BEGIN
  WITH viejas AS (
    SELECT * FROM public.sesiones_1a1
    WHERE duracion_min IS NULL AND fecha < _limite
  ), ins AS (
    INSERT INTO public.sesiones_canceladas
      (tipo, referencia_id, profesor_id, contraparte_id, fecha, hora_inicio, estado, razon, creado_por)
    SELECT '1a1', id, profesor_id, alumna_id, fecha, hora_inicio, 'no_registrada', NULL, NULL FROM viejas
    RETURNING referencia_id
  ), del AS (
    DELETE FROM public.sesiones_1a1 WHERE id IN (SELECT referencia_id FROM ins) RETURNING 1
  )
  SELECT count(*) INTO _n FROM del;

  WITH viejasc AS (
    SELECT * FROM public.clases_en_vivo
    WHERE duracion_min IS NULL AND fecha < _limite AND profesor_id IS NOT NULL
  ), insc AS (
    INSERT INTO public.sesiones_canceladas
      (tipo, referencia_id, profesor_id, contraparte_id, titulo, fecha, hora_inicio, estado, razon, creado_por)
    SELECT 'clase', id, profesor_id, NULL, titulo, fecha, hora_inicio, 'no_registrada', NULL, NULL FROM viejasc
    RETURNING referencia_id
  ), delc AS (
    DELETE FROM public.clases_en_vivo WHERE id IN (SELECT referencia_id FROM insc) RETURNING 1
  )
  SELECT count(*) INTO _c FROM delc;

  RETURN _n + _c;
END; $$;

-- Solo el profesor asignado puede registrar duracion
DROP FUNCTION IF EXISTS public.registrar_duracion_sesion(uuid, integer);
DROP FUNCTION IF EXISTS public.registrar_duracion_clase(uuid, integer);

CREATE OR REPLACE FUNCTION public.registrar_duracion_sesion(_sesion_id uuid, _duracion_min integer, _hora_inicio time without time zone DEFAULT NULL::time without time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF _s.profesor_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'Solo el profesor asignado puede registrar la duracion';
  END IF;

  _ini := COALESCE(_hora_inicio, _s.hora_inicio);
  _fin := (_ini + make_interval(mins => _duracion_min))::time;

  UPDATE public.sesiones_1a1
    SET duracion_min = _duracion_min, hora_inicio = _ini, hora_fin = _fin,
        estado = 'finalizada', finalizada_at = now()
    WHERE id = _sesion_id;

  SELECT tarifa_sesion_1a1 INTO _tarifa FROM public.profiles WHERE id = _s.profesor_id;
  _tarifa := COALESCE(_tarifa, 0);

  DELETE FROM public.horas_trabajadas WHERE referencia_id = _sesion_id AND tipo = 'sesion_1a1';
  INSERT INTO public.horas_trabajadas (profesor_id, fecha, tipo, horas, tarifa, monto, referencia_id)
  VALUES (_s.profesor_id, _s.fecha, 'sesion_1a1',
    ROUND(_duracion_min::numeric / 60, 4), _tarifa,
    ROUND(_tarifa * _duracion_min::numeric / 60, 2), _sesion_id);
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_duracion_clase(_clase_id uuid, _duracion_min integer, _hora_inicio time without time zone DEFAULT NULL::time without time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  IF _c.profesor_id IS NULL OR _c.profesor_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'Solo el profesor asignado puede registrar la duracion';
  END IF;

  _ini := COALESCE(_hora_inicio, _c.hora_inicio);
  _fin := (_ini + make_interval(mins => _duracion_min))::time;

  UPDATE public.clases_en_vivo
    SET duracion_min = _duracion_min, hora_inicio = _ini, hora_fin = _fin, finalizada_at = now()
    WHERE id = _clase_id;

  SELECT tarifa_hora_clase INTO _tarifa FROM public.profiles WHERE id = _c.profesor_id;
  _tarifa := COALESCE(_tarifa, 0);

  DELETE FROM public.horas_trabajadas WHERE referencia_id = _clase_id AND tipo = 'clase';
  INSERT INTO public.horas_trabajadas (profesor_id, fecha, tipo, horas, tarifa, monto, referencia_id)
  VALUES (_c.profesor_id, _c.fecha, 'clase',
    ROUND(_duracion_min::numeric / 60, 4), _tarifa,
    ROUND(_tarifa * _duracion_min::numeric / 60, 2), _clase_id);
END; $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('marcar-no-registradas-diario', '15 5 * * *', $$SELECT public.marcar_no_registradas();$$);
