
-- Fix 1: explicit SELECT policy for course-covers public bucket
CREATE POLICY "course_covers_public_select"
ON storage.objects
FOR SELECT
USING (bucket_id = 'course-covers');

-- Fix 2: restrict staff profile visibility to active users only
DROP POLICY IF EXISTS profiles_staff_visible ON public.profiles;

CREATE POLICY profiles_staff_visible
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (public.has_role(id, 'admin'::public.app_role) OR public.has_role(id, 'soporte'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.estado = 'activo'::public.user_estado
  )
);
