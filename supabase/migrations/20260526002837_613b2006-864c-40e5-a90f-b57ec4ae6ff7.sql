
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS image_url TEXT;

DROP POLICY IF EXISTS "permisos_admin_write" ON public.permisos_cursos;
CREATE POLICY "permisos_staff_write" ON public.permisos_cursos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));

DROP POLICY IF EXISTS "permisos_select" ON public.permisos_cursos;
CREATE POLICY "permisos_select" ON public.permisos_cursos FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-covers', 'course-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "course_covers_public_read" ON storage.objects;
CREATE POLICY "course_covers_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'course-covers');

DROP POLICY IF EXISTS "course_covers_staff_write" ON storage.objects;
CREATE POLICY "course_covers_staff_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'course-covers' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte')))
  WITH CHECK (bucket_id = 'course-covers' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte')));
