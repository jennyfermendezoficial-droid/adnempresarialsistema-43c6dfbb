
ALTER TABLE public.tareas_entregas
  ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS tutorial_alumnos_url text,
  ADD COLUMN IF NOT EXISTS tutorial_profesores_url text;

GRANT SELECT (tutorial_alumnos_url, tutorial_profesores_url, inicio_video_url, inicio_titulo, inicio_mensaje, id, updated_at) ON public.app_config TO authenticated;
GRANT UPDATE (tutorial_alumnos_url, tutorial_profesores_url, inicio_video_url, inicio_titulo, inicio_mensaje) ON public.app_config TO authenticated;
