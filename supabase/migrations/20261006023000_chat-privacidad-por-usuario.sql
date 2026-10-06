-- Privacidad de chats 1:1: cada usuario solo puede consultar y operar
-- conversaciones en las que participa. El canal de profesores sigue separado.
DROP POLICY IF EXISTS "chats_participantes" ON public.chats_1a1;
DROP POLICY IF EXISTS "chats_insert" ON public.chats_1a1;

CREATE POLICY "chats_participantes"
ON public.chats_1a1
FOR SELECT
TO authenticated
USING (
  usuario_a_id = auth.uid()
  OR usuario_b_id = auth.uid()
);

CREATE POLICY "chats_insert"
ON public.chats_1a1
FOR INSERT
TO authenticated
WITH CHECK (
  usuario_a_id = auth.uid()
  OR usuario_b_id = auth.uid()
);

DROP POLICY IF EXISTS "msg_select" ON public.mensajes_chat_1a1;
DROP POLICY IF EXISTS "msg_insert" ON public.mensajes_chat_1a1;

CREATE POLICY "msg_select"
ON public.mensajes_chat_1a1
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chats_1a1 c
    WHERE c.id = chat_id
      AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
  )
);

CREATE POLICY "msg_insert"
ON public.mensajes_chat_1a1
FOR INSERT
TO authenticated
WITH CHECK (
  autor_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.chats_1a1 c
    WHERE c.id = chat_id
      AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
  )
);

NOTIFY pgrst, 'reload schema';
