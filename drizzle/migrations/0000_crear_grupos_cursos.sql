CREATE TABLE public.grupos_cursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  image_url text,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_cursos TO authenticated;
GRANT ALL ON public.grupos_cursos TO service_role;
ALTER TABLE public.grupos_cursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupos_cursos_select" ON public.grupos_cursos FOR SELECT TO authenticated USING (true);
CREATE POLICY "grupos_cursos_insert" ON public.grupos_cursos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'soporte'::public.app_role));
CREATE POLICY "grupos_cursos_update" ON public.grupos_cursos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'soporte'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'soporte'::public.app_role));
CREATE POLICY "grupos_cursos_delete" ON public.grupos_cursos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'soporte'::public.app_role));
ALTER TABLE public.cursos ADD COLUMN grupo_id uuid NULL REFERENCES public.grupos_cursos(id) ON DELETE SET NULL;