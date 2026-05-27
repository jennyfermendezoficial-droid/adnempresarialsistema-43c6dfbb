CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND estado = 'activo'::public.user_estado
  )
$$;

DROP POLICY IF EXISTS profiles_staff_visible ON public.profiles;

CREATE POLICY profiles_staff_visible
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (public.has_role(id, 'admin'::public.app_role) OR public.has_role(id, 'soporte'::public.app_role))
  AND public.is_active_user(auth.uid())
);