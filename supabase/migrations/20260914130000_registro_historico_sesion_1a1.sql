-- Permite a profesores/soporte y administradores registrar una sesión 1 a 1
-- que ya ocurrió durante el mes actual. La sesión y su registro de horas/pago
-- se crean en una sola transacción reutilizando registrar_duracion_sesion.

CREATE OR REPLACE FUNCTION public.registrar_sesion_1a1_historica(
  _alumna_id uuid,
  _fecha date,
  _hora_inicio time,
  _duracion_min integer,
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sesion_id uuid;
  _hora_fin time;
  _ahora_local timestamp := now() AT TIME ZONE 'America/Guayaquil';
  _fin_local timestamp;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT (
    public.has_role(_uid, 'soporte'::public.app_role)
    OR public.has_role(_uid, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para registrar sesiones históricas';
  END IF;

  IF _alumna_id IS NULL OR _alumna_id = _uid THEN
    RAISE EXCEPTION 'Selecciona una alumna válida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _alumna_id) THEN
    RAISE EXCEPTION 'La alumna seleccionada no existe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _alumna_id
      AND role IN ('admin'::public.app_role, 'soporte'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Selecciona una cuenta de alumna, no una cuenta del equipo';
  END IF;

  IF _fecha IS NULL
     OR date_trunc('month', _fecha::timestamp) <> date_trunc('month', _ahora_local)
     OR _fecha > _ahora_local::date THEN
    RAISE EXCEPTION 'Solo puedes registrar sesiones ocurridas durante el mes actual';
  END IF;

  IF _hora_inicio IS NULL THEN
    RAISE EXCEPTION 'Indica la hora de inicio';
  END IF;

  IF _duracion_min IS NULL OR _duracion_min < 1 OR _duracion_min > 60 THEN
    RAISE EXCEPTION 'La duración de una sesión 1 a 1 debe estar entre 1 y 60 minutos';
  END IF;

  _hora_fin := (_hora_inicio + make_interval(mins => _duracion_min))::time;
  _fin_local := (_fecha + _hora_inicio) + make_interval(mins => _duracion_min);

  IF _fin_local > _ahora_local THEN
    RAISE EXCEPTION 'La sesión indicada todavía no ha terminado';
  END IF;

  INSERT INTO public.sesiones_1a1 (
    profesor_id,
    alumna_id,
    fecha,
    hora_inicio,
    hora_fin,
    estado,
    motivo,
    recordatorio_enviado,
    zoom_link,
    zoom_meeting_id
  )
  VALUES (
    _uid,
    _alumna_id,
    _fecha,
    _hora_inicio,
    _hora_fin,
    'confirmada',
    NULLIF(trim(COALESCE(_motivo, '')), ''),
    true,
    NULL,
    NULL
  )
  RETURNING id INTO _sesion_id;

  -- Reutiliza la lógica oficial: finaliza la sesión, aplica el máximo de 60 min,
  -- calcula tarifa/monto y crea horas_trabajadas. Si falla, todo hace rollback.
  PERFORM public.registrar_duracion_sesion(
    _sesion_id,
    _duracion_min,
    _hora_inicio
  );

  RETURN _sesion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_sesion_1a1_historica(uuid, date, time, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_sesion_1a1_historica(uuid, date, time, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
