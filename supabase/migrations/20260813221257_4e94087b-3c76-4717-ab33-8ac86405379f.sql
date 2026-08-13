CREATE OR REPLACE FUNCTION public.actividad_miembros()
RETURNS TABLE(user_id uuid, ultima_actividad timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.user_id, MAX(s.ultima_actividad)
  FROM public.sesiones_activas s
  WHERE auth.uid() IS NOT NULL
  GROUP BY s.user_id
$$;

REVOKE ALL ON FUNCTION public.actividad_miembros() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actividad_miembros() TO authenticated;