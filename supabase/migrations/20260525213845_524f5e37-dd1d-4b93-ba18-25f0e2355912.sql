
-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('chat-media', 'chat-media', false),
  ('avatars', 'avatars', true),
  ('course-media', 'course-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: chat-media (any authenticated user can read/upload to their own folder)
CREATE POLICY "chat_media_read_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-media');
CREATE POLICY "chat_media_insert_auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chat_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies: avatars (public read, own folder write)
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies: course-media (authenticated read, admin/soporte write)
CREATE POLICY "course_media_read_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'course-media');
CREATE POLICY "course_media_staff_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'course-media' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role))
  );
CREATE POLICY "course_media_staff_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'course-media' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role))
  );

-- App config table
CREATE TABLE public.app_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  inicio_video_url text,
  inicio_titulo text DEFAULT 'Bienvenidos a ADN Empresarial',
  inicio_mensaje text DEFAULT 'Tu transformación empresarial comienza aquí. Explora los cursos, agenda sesiones 1a1 y conecta con la comunidad.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_config (id) VALUES (true);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config_read_all" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_config_admin_write" ON public.app_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Soporte privado messages (user <-> staff)
CREATE TABLE public.soporte_privado_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  autor_id uuid NOT NULL,
  contenido text,
  tipo text NOT NULL DEFAULT 'texto',
  media_url text,
  leido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX soporte_privado_usuario_idx ON public.soporte_privado_mensajes(usuario_id, created_at);
ALTER TABLE public.soporte_privado_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soporte_select" ON public.soporte_privado_mensajes FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role));
CREATE POLICY "soporte_insert" ON public.soporte_privado_mensajes FOR INSERT TO authenticated
  WITH CHECK (
    autor_id = auth.uid() AND (
      usuario_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role)
    )
  );

-- Realtime
ALTER TABLE public.canal_general_mensajes REPLICA IDENTITY FULL;
ALTER TABLE public.chats_1a1 REPLICA IDENTITY FULL;
ALTER TABLE public.mensajes_chat_1a1 REPLICA IDENTITY FULL;
ALTER TABLE public.soporte_privado_mensajes REPLICA IDENTITY FULL;
ALTER TABLE public.sesiones_1a1 REPLICA IDENTITY FULL;
ALTER TABLE public.clases_en_vivo REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.canal_general_mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats_1a1;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat_1a1;
ALTER PUBLICATION supabase_realtime ADD TABLE public.soporte_privado_mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sesiones_1a1;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clases_en_vivo;
