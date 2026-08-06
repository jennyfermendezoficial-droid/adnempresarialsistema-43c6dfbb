
ALTER TABLE public.sesiones_1a1 ADD COLUMN IF NOT EXISTS recordatorio_enviado boolean NOT NULL DEFAULT false;
ALTER TABLE public.clases_en_vivo ALTER COLUMN recordatorio_enviado SET DEFAULT false;
UPDATE public.clases_en_vivo SET recordatorio_enviado = false WHERE recordatorio_enviado IS NULL;

CREATE OR REPLACE FUNCTION public.notif_sesion_1a1_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _cuando text;
BEGIN
  _cuando := to_char(NEW.fecha, 'DD/MM') || ' · ' || to_char(NEW.hora_inicio, 'HH24:MI');
  PERFORM public.notificar(
    ARRAY(SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin') || ARRAY[NEW.profesor_id],
    'sesion_nueva', 'Nueva reserva 1 a 1',
    public.nombre_usuario(NEW.alumna_id) || ' reservó con ' || public.nombre_usuario(NEW.profesor_id) || ' · ' || _cuando,
    '/agenda-1a1', NEW.alumna_id, NEW.id
  );
  PERFORM public.notificar(
    ARRAY[NEW.alumna_id], 'sesion_nueva', 'Reserva confirmada',
    'Con ' || public.nombre_usuario(NEW.profesor_id) || ' · ' || _cuando,
    '/agenda-1a1', NULL, NEW.id
  );
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.notif_clase_nueva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _dest uuid[];
BEGIN
  IF NEW.curso_id IS NULL THEN
    _dest := ARRAY(SELECT id FROM public.profiles);
  ELSE
    _dest := ARRAY(SELECT usuario_id FROM public.permisos_cursos WHERE curso_id = NEW.curso_id);
  END IF;
  IF NEW.profesor_id IS NOT NULL THEN _dest := _dest || ARRAY[NEW.profesor_id]; END IF;
  PERFORM public.notificar(_dest, 'clase_nueva', 'Nueva clase en vivo',
    NEW.titulo
      || CASE WHEN NEW.profesor_id IS NOT NULL THEN ' · con ' || public.nombre_usuario(NEW.profesor_id) ELSE '' END
      || ' · ' || to_char(NEW.fecha, 'DD/MM') || ' ' || to_char(NEW.hora_inicio, 'HH24:MI'),
    '/calendario-clases', NEW.created_by, NEW.id);
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enviar_recordatorios()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _ahora timestamp := (now() AT TIME ZONE 'America/Guayaquil');
  _n integer := 0;
  _r record;
  _dest uuid[];
BEGIN
  FOR _r IN
    SELECT * FROM public.sesiones_1a1
    WHERE recordatorio_enviado = false
      AND estado <> 'finalizada'
      AND (fecha + hora_inicio) BETWEEN _ahora + interval '50 minutes' AND _ahora + interval '70 minutes'
  LOOP
    PERFORM public.notificar(
      ARRAY[_r.alumna_id, _r.profesor_id], 'recordatorio',
      'Tu sesión 1 a 1 empieza en 1 hora',
      to_char(_r.hora_inicio, 'HH24:MI') || ' · con '
        || public.nombre_usuario(_r.profesor_id),
      '/agenda-1a1', NULL, _r.id);
    UPDATE public.sesiones_1a1 SET recordatorio_enviado = true WHERE id = _r.id;
    _n := _n + 1;
  END LOOP;

  FOR _r IN
    SELECT * FROM public.clases_en_vivo
    WHERE COALESCE(recordatorio_enviado, false) = false
      AND (fecha + hora_inicio) BETWEEN _ahora + interval '50 minutes' AND _ahora + interval '70 minutes'
  LOOP
    IF _r.curso_id IS NULL THEN
      _dest := ARRAY(SELECT id FROM public.profiles);
    ELSE
      _dest := ARRAY(SELECT usuario_id FROM public.permisos_cursos WHERE curso_id = _r.curso_id);
    END IF;
    IF _r.profesor_id IS NOT NULL THEN _dest := _dest || ARRAY[_r.profesor_id]; END IF;
    PERFORM public.notificar(_dest, 'recordatorio',
      'Tu clase en vivo empieza en 1 hora',
      _r.titulo || ' · ' || to_char(_r.hora_inicio, 'HH24:MI'),
      '/calendario-clases', NULL, _r.id);
    UPDATE public.clases_en_vivo SET recordatorio_enviado = true WHERE id = _r.id;
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END; $function$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
