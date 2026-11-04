GRANT EXECUTE ON FUNCTION public.es_miembro_activo() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';