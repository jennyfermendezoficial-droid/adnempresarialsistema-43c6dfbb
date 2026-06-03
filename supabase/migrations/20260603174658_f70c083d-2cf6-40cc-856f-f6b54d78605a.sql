GRANT SELECT (actividad) ON public.profiles TO authenticated;
GRANT UPDATE (actividad, nombre_completo) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;