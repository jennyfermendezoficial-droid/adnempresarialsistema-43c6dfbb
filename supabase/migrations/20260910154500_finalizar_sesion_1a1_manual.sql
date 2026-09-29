-- Finalización manual de sesiones 1 a 1 por el profesor.
-- No modifica pagos, clases en vivo ni reservas de alumnas.
-- Al finalizar se guarda la hora real de cierre; la lógica existente de Agenda
-- detecta ese hora_fin y habilita Registrar duración inmediatamente.

CREATE OR REPLACE FUNCTION public.finalizar_sesion_1a1(_sesion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.sesiones_1a1%ROWTYPE;
  _ahora_ecuador timestamp := now() AT TIME ZONE 'America/Guayaquil';
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT *
  INTO _s
  FROM public.sesiones_1a1
  WHERE id = _sesion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF NOT (_s.profesor_id = _uid OR public.has_role(_uid, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF lower(coalesce(_s.estado, 'confirmada')) IN (
    'cancelada', 'cancelado', 'anulada', 'anulado', 'no_realizada', 'no realizado'
  ) THEN
    RAISE EXCEPTION 'La sesión ya fue resuelta como no realizada o cancelada';
  END IF;

  IF COALESCE(_s.duracion_min, 0) > 0 THEN
    RAISE EXCEPTION 'La sesión ya tiene una duración registrada';
  END IF;

  IF (_s.fecha + _s.hora_inicio) > _ahora_ecuador THEN
    RAISE EXCEPTION 'La reunión todavía no ha iniciado';
  END IF;

  UPDATE public.sesiones_1a1
  SET hora_fin = _ahora_ecuador::time,
      estado = 'finalizada',
      finalizada_at = now()
  WHERE id = _sesion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_sesion_1a1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_sesion_1a1(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
