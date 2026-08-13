-- Chat privado del panel superior.
-- No elimina el canal_general_mensajes ni modifica /chats.

CREATE OR REPLACE FUNCTION public.listar_soporte_chat()
RETURNS TABLE (
  id uuid,
  nombre_completo text,
  email text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'soporte'::public.app_role
    AND p.estado = 'activo'::public.user_estado
  ORDER BY COALESCE(NULLIF(p.nombre_completo, ''), p.email);
$$;

GRANT EXECUTE ON FUNCTION public.listar_soporte_chat() TO authenticated;

CREATE OR REPLACE FUNCTION public.crear_chat_soporte(_target_id uuid)
RETURNS public.chats_1a1
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _chat public.chats_1a1;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _target_id
      AND estado = 'activo'::public.user_estado
  ) THEN
    RAISE EXCEPTION 'Usuario no disponible';
  END IF;

  -- Las alumnas solo pueden iniciar conversaciones con soporte.
  IF public.has_role(_uid, 'usuario'::public.app_role) THEN
    IF NOT public.has_role(_target_id, 'soporte'::public.app_role) THEN
      RAISE EXCEPTION 'Solo puedes iniciar conversaciones con soporte';
    END IF;
  -- Soporte/admin puede abrir un chat con una alumna solo desde un flujo explícito.
  ELSIF public.has_role(_uid, 'soporte'::public.app_role)
     OR public.has_role(_uid, 'admin'::public.app_role) THEN
    IF NOT public.has_role(_target_id, 'usuario'::public.app_role) THEN
      RAISE EXCEPTION 'Solo puedes iniciar conversaciones con alumnas';
    END IF;
  ELSE
    RAISE EXCEPTION 'Rol no permitido para chats privados';
  END IF;

  SELECT *
  INTO _chat
  FROM public.chats_1a1
  WHERE (usuario_a_id = _uid AND usuario_b_id = _target_id)
     OR (usuario_a_id = _target_id AND usuario_b_id = _uid)
  LIMIT 1;

  IF _chat.id IS NOT NULL THEN
    RETURN _chat;
  END IF;

  INSERT INTO public.chats_1a1 (usuario_a_id, usuario_b_id)
  VALUES (_uid, _target_id)
  RETURNING * INTO _chat;

  RETURN _chat;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_chat_soporte(uuid) TO authenticated;
