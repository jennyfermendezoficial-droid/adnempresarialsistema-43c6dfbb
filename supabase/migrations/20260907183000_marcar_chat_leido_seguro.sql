-- Marca como leídos únicamente los mensajes recibidos dentro de un chat
-- en el que participa el usuario autenticado. No permite editar contenido.
CREATE OR REPLACE FUNCTION public.marcar_mi_chat_leido(_chat_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chats_1a1 c
    WHERE c.id = _chat_id
      AND (c.usuario_a_id = v_uid OR c.usuario_b_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'No perteneces a este chat';
  END IF;

  UPDATE public.mensajes_chat_1a1
  SET leido = true
  WHERE chat_id = _chat_id
    AND autor_id <> v_uid
    AND leido = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_mi_chat_leido(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_mi_chat_leido(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
