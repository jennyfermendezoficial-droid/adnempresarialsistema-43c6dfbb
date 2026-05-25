
CREATE TABLE public.chat_profesores_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id uuid NOT NULL,
  contenido text,
  media_url text,
  tipo text NOT NULL DEFAULT 'texto',
  eliminado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_profesores_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_select_staff" ON public.chat_profesores_mensajes
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'));

CREATE POLICY "cp_insert_staff" ON public.chat_profesores_mensajes
FOR INSERT TO authenticated
WITH CHECK (autor_id = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte')));

CREATE POLICY "cp_update_self" ON public.chat_profesores_mensajes
FOR UPDATE TO authenticated
USING (autor_id = auth.uid());

CREATE POLICY "cp_delete_self_or_admin" ON public.chat_profesores_mensajes
FOR DELETE TO authenticated
USING (autor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_profesores_mensajes;
