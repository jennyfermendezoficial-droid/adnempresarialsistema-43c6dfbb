-- Allow any authenticated user to see which users are staff (admin/soporte),
-- so the 1:1 chat picker can show only professors to students.
CREATE POLICY "roles_staff_visible"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role IN ('admin'::public.app_role, 'soporte'::public.app_role));