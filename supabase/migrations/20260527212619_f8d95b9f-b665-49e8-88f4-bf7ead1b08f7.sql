
REVOKE ALL ON FUNCTION public.get_my_tarifas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_profesor_tarifas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tarifas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profesor_tarifas(uuid) TO authenticated;
