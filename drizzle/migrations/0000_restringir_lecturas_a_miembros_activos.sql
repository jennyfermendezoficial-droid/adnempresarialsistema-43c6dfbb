-- Helper: el usuario actual es un miembro activo (o líder/admin)
CREATE OR REPLACE FUNCTION public.es_miembro_activo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.estado = 'activo'::public.user_estado
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.es_miembro_activo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_miembro_activo() TO authenticated;

-- Comunidad
DROP POLICY IF EXISTS likes_select ON public.comunidad_likes;
CREATE POLICY likes_select ON public.comunidad_likes
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS posts_select ON public.comunidad_posts;
CREATE POLICY posts_select ON public.comunidad_posts
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS com_select ON public.comunidad_comentarios;
CREATE POLICY com_select ON public.comunidad_comentarios
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS cat_select ON public.comunidad_categorias;
CREATE POLICY cat_select ON public.comunidad_categorias
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS puntos_select ON public.puntos_usuario;
CREATE POLICY puntos_select ON public.puntos_usuario
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

-- Canal general, configuración, disponibilidad y cursos
DROP POLICY IF EXISTS canal_select ON public.canal_general_mensajes;
CREATE POLICY canal_select ON public.canal_general_mensajes
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS app_config_read_all ON public.app_config;
CREATE POLICY app_config_read_all ON public.app_config
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS dispo_select ON public.disponibilidad;
CREATE POLICY dispo_select ON public.disponibilidad
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

DROP POLICY IF EXISTS cursos_select ON public.cursos;
CREATE POLICY cursos_select ON public.cursos
  FOR SELECT TO authenticated USING (public.es_miembro_activo());

-- Storage: buckets públicos (las URL públicas siguen funcionando sin política SELECT);
-- se elimina el listado abierto y cada quien solo lista su propia carpeta.
DROP POLICY IF EXISTS avatars_public_select ON storage.objects;
CREATE POLICY avatars_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- course-covers: el personal ya tiene acceso por course_covers_staff_write
DROP POLICY IF EXISTS course_covers_public_select ON storage.objects;

-- chat-media: los archivos del canal general solo para miembros activos
DROP POLICY IF EXISTS chat_media_read_participants ON storage.objects;
CREATE POLICY chat_media_read_participants ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media' AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'soporte'::public.app_role)
      OR (
        public.es_miembro_activo()
        AND EXISTS (SELECT 1 FROM public.canal_general_mensajes m WHERE m.media_url = objects.name)
      )
      OR EXISTS (
        SELECT 1 FROM public.mensajes_chat_1a1 m
        JOIN public.chats_1a1 c ON c.id = m.chat_id
        WHERE m.media_url = objects.name
          AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.soporte_privado_mensajes s
        WHERE s.media_url = objects.name AND s.usuario_id = auth.uid()
      )
    )
  );