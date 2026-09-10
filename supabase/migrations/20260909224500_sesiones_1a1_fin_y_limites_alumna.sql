-- Reglas de integridad para Agenda 1 a 1:
-- 1) una alumna no puede tener sesiones 1 a 1 que se crucen entre profesores;
-- 2) máximo 2 sesiones activas por alumna y día;
-- 3) no se puede registrar duración antes de que termine el horario reservado.
--
-- No modifica datos existentes. Las validaciones se aplican a nuevas reservas,
-- reprogramaciones y futuros registros de duración.

CREATE OR REPLACE FUNCTION public.validar_horario_alumna_sesion_1a1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_key bigint;
  sesiones_del_dia integer;
BEGIN
  -- Estados que ya no representan una reserva activa no bloquean cupos.
  IF lower(coalesce(NEW.estado, 'confirmada')) IN (
    'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
  ) THEN
    RETURN NEW;
  END IF;

  -- Serializa reservas/reprogramaciones de una misma alumna en el mismo día.
  lock_key := hashtextextended(
    NEW.alumna_id::text || '|' || NEW.fecha::text,
    20260909
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT count(*)
  INTO sesiones_del_dia
  FROM public.sesiones_1a1 s
  WHERE s.alumna_id = NEW.alumna_id
    AND s.fecha = NEW.fecha
    AND s.id <> NEW.id
    AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
      'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
    );

  IF sesiones_del_dia >= 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Máximo 2 sesiones 1 a 1 por día. Elige otro día.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.alumna_id = NEW.alumna_id
      AND s.fecha = NEW.fecha
      AND s.id <> NEW.id
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN (
        'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
      )
      AND s.hora_inicio < (NEW.hora_inicio + interval '60 minutes')::time
      AND (s.hora_inicio + interval '60 minutes')::time > NEW.hora_inicio
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Ya tienes otra sesión 1 a 1 en ese horario. Elige otra hora.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_horario_alumna_sesion_1a1 ON public.sesiones_1a1;
CREATE TRIGGER trg_validar_horario_alumna_sesion_1a1
BEFORE INSERT OR UPDATE OF alumna_id, fecha, hora_inicio
ON public.sesiones_1a1
FOR EACH ROW
EXECUTE FUNCTION public.validar_horario_alumna_sesion_1a1();

-- Mantiene la firma que ya consume RegistrarDuracionModal. Solo añade la
-- validación del fin programado antes de conservar el comportamiento existente
-- de cierre de sesión y registro de horas/pago.
CREATE OR REPLACE FUNCTION public.registrar_duracion_sesion(
  _sesion_id uuid,
  _duracion_min integer,
  _hora_inicio time DEFAULT NULL
)
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
  _fin_programado timestamp;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF _duracion_min IS NULL OR _duracion_min <= 0 OR _duracion_min > 60 THEN
    RAISE EXCEPTION 'Duracion invalida: las sesiones 1 a 1 permiten máximo 60 minutos';
  END IF;

  SELECT *
  INTO _s
  FROM public.sesiones_1a1
  WHERE id = _sesion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesion no encontrada';
  END IF;

  IF NOT (_s.profesor_id = _uid OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- En el primer registro, hora_fin puede ser NULL porque la reserva conserva
  -- solo la hora inicial. En ese caso su fin programado es inicio + 60 minutos.
  -- Si ya hay duración, se trata de una edición de un registro ya finalizado.
  IF COALESCE(_s.duracion_min, 0) <= 0 THEN
    IF _s.hora_fin IS NOT NULL THEN
      _fin_programado := _s.fecha + _s.hora_fin;
      IF _s.hora_fin < _s.hora_inicio THEN
        _fin_programado := _fin_programado + interval '1 day';
      END IF;
    ELSE
      _fin_programado := (_s.fecha + _s.hora_inicio) + interval '60 minutes';
    END IF;

    IF _fin_programado > (now() AT TIME ZONE 'America/Guayaquil') THEN
      RAISE EXCEPTION 'La sesión todavía no ha terminado. Registra la duración después de la hora final.';
    END IF;
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

  SELECT tarifa_sesion_1a1
  INTO _tarifa
  FROM public.profiles
  WHERE id = _s.profesor_id;

  _tarifa := COALESCE(_tarifa, 0);

  DELETE FROM public.horas_trabajadas
  WHERE referencia_id = _sesion_id
    AND tipo = 'sesion_1a1';

  INSERT INTO public.horas_trabajadas (
    profesor_id,
    fecha,
    tipo,
    horas,
    tarifa,
    monto,
    referencia_id
  )
  VALUES (
    _s.profesor_id,
    _s.fecha,
    'sesion_1a1',
    ROUND(_duracion_min::numeric / 60, 4),
    _tarifa,
    ROUND(_tarifa * _duracion_min::numeric / 60, 2),
    _sesion_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_duracion_sesion(uuid, integer, time) TO authenticated;

NOTIFY pgrst, 'reload schema';
