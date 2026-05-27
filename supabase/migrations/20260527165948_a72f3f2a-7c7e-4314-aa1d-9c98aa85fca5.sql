
-- TAREAS
CREATE TABLE public.tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  descripcion text,
  fecha_limite timestamp with time zone,
  curso_id uuid REFERENCES public.cursos(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas TO authenticated;
GRANT ALL ON public.tareas TO service_role;

ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tareas_select_all ON public.tareas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tareas_staff_write ON public.tareas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role));

-- ENTREGAS
CREATE TABLE public.tareas_entregas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  alumna_id uuid NOT NULL,
  archivo_url text NOT NULL,
  archivo_nombre text NOT NULL,
  archivo_tipo text,
  comentario text,
  calificacion numeric,
  feedback text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_tareas_entregas_tarea ON public.tareas_entregas(tarea_id);
CREATE INDEX idx_tareas_entregas_alumna ON public.tareas_entregas(alumna_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas_entregas TO authenticated;
GRANT ALL ON public.tareas_entregas TO service_role;

ALTER TABLE public.tareas_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY entregas_select ON public.tareas_entregas
  FOR SELECT TO authenticated
  USING (alumna_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role));

CREATE POLICY entregas_insert_self ON public.tareas_entregas
  FOR INSERT TO authenticated
  WITH CHECK (alumna_id = auth.uid());

CREATE POLICY entregas_update_self_or_staff ON public.tareas_entregas
  FOR UPDATE TO authenticated
  USING (alumna_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role));

CREATE POLICY entregas_delete_self_or_staff ON public.tareas_entregas
  FOR DELETE TO authenticated
  USING (alumna_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('tareas', 'tareas', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY tareas_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tareas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY tareas_select_own_or_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tareas' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'soporte'::app_role)
  ));

CREATE POLICY tareas_delete_own_or_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tareas' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
  ));
