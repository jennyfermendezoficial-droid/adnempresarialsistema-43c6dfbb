CREATE OR REPLACE FUNCTION public.perfiles_publicos(_ids uuid[])
RETURNS TABLE(id uuid, nombre_completo text, avatar_url text, actividad text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre_completo, p.avatar_url, p.actividad
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(COALESCE(_ids, '{}'::uuid[]))
$$;

GRANT EXECUTE ON FUNCTION public.perfiles_publicos(uuid[]) TO authenticated;