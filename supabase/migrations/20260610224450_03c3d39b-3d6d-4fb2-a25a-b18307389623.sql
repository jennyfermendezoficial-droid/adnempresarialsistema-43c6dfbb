
CREATE TABLE public.sesiones_activas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  dispositivo text,
  creada_en timestamptz NOT NULL DEFAULT now(),
  ultima_actividad timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sesiones_activas_user ON public.sesiones_activas(user_id, ultima_actividad);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sesiones_activas TO authenticated;
GRANT ALL ON public.sesiones_activas TO service_role;

ALTER TABLE public.sesiones_activas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus sesiones" ON public.sesiones_activas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuario borra sus sesiones" ON public.sesiones_activas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.registrar_sesion(_session_id text, _dispositivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _count int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  INSERT INTO public.sesiones_activas (user_id, session_id, dispositivo)
  VALUES (_uid, _session_id, _dispositivo)
  ON CONFLICT (session_id) DO UPDATE
    SET ultima_actividad = now(), dispositivo = EXCLUDED.dispositivo;

  SELECT COUNT(*) INTO _count FROM public.sesiones_activas WHERE user_id = _uid;

  IF _count > 5 THEN
    DELETE FROM public.sesiones_activas
    WHERE id IN (
      SELECT id FROM public.sesiones_activas
      WHERE user_id = _uid
      ORDER BY ultima_actividad ASC
      LIMIT (_count - 5)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_sesion(_session_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.sesiones_activas
    WHERE session_id = _session_id AND user_id = _uid
  ) INTO _exists;
  IF _exists THEN
    UPDATE public.sesiones_activas
      SET ultima_actividad = now()
      WHERE session_id = _session_id AND user_id = _uid;
  END IF;
  RETURN _exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_sesion(_session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sesiones_activas
  WHERE session_id = _session_id AND user_id = auth.uid();
END;
$$;
