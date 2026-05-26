-- Permitir ver perfiles de admin y soporte a cualquier autenticado
CREATE POLICY "profiles_staff_visible"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(id, 'admin'::public.app_role)
  OR public.has_role(id, 'soporte'::public.app_role)
);