-- Quitar acceso directo a las columnas de tarifas para usuarios autenticados/anon.
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id, email, nombre_completo, avatar_url, estado,
  created_at, updated_at, negocio_foto_url, negocio_nombre, actividad
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;