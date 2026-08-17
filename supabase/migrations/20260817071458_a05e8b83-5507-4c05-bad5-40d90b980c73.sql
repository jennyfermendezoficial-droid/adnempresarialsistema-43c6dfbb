CREATE OR REPLACE FUNCTION public.perfiles_pagos(_ids uuid[])
RETURNS TABLE(id uuid, nombre_completo text, email text, avatar_url text, banco text, tipo_cuenta text, numero_cuenta text, titular_cuenta text, banco_logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url, p.banco, p.tipo_cuenta, p.numero_cuenta, p.titular_cuenta, p.banco_logo_url
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND (public.has_role(auth.uid(), 'admin') OR p.id = auth.uid())
$$;

REVOKE ALL ON FUNCTION public.perfiles_pagos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfiles_pagos(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perfiles_basicos(_ids uuid[])
RETURNS TABLE(id uuid, nombre_completo text, email text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
$$;

REVOKE ALL ON FUNCTION public.perfiles_basicos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfiles_basicos(uuid[]) TO authenticated, service_role;