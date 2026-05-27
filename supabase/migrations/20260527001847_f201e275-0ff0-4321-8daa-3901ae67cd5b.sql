
-- 1) Prevent non-admin users from changing their own approval estado
REVOKE UPDATE (estado) ON public.profiles FROM authenticated;
-- Admins/soporte use service_role or have role-bypass via policies; keep service_role full
GRANT UPDATE (estado) ON public.profiles TO service_role;

-- 2) Tighten profiles_select_scoped: only expose the staff (profesor) side of a 1a1 session.
DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_scoped
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'soporte'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.sesiones_1a1 s
    WHERE s.alumna_id = auth.uid()
      AND s.profesor_id = profiles.id
  )
);

-- 3) Explicit SELECT policy for avatars bucket (public read, but RLS-gated)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');
