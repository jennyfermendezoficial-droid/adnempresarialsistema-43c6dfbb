
DROP POLICY IF EXISTS chat_media_read_auth ON storage.objects;
CREATE POLICY chat_media_read_participants ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'soporte'::app_role)
    OR EXISTS (SELECT 1 FROM public.canal_general_mensajes m WHERE m.media_url = storage.objects.name)
    OR EXISTS (
      SELECT 1 FROM public.mensajes_chat_1a1 m
      JOIN public.chats_1a1 c ON c.id = m.chat_id
      WHERE m.media_url = storage.objects.name
        AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.soporte_privado_mensajes s
      WHERE s.media_url = storage.objects.name AND s.usuario_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS course_media_read_auth ON storage.objects;
CREATE POLICY course_media_read_permitted ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'course-media' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'soporte'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.permisos_cursos pc
      WHERE pc.usuario_id = auth.uid()
        AND pc.curso_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS avatars_read_public ON storage.objects;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
DO $$ BEGIN
  PERFORM 1; -- placeholder
EXCEPTION WHEN OTHERS THEN NULL; END $$;
