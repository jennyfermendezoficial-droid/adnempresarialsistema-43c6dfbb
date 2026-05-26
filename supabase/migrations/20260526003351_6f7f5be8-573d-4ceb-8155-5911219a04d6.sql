-- Profiles: expand SELECT in a scoped, safe way
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;

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
    WHERE (s.profesor_id = auth.uid() AND s.alumna_id = profiles.id)
       OR (s.alumna_id = auth.uid() AND s.profesor_id = profiles.id)
  )
);

-- Storage: explicit UPDATE policy for course-media bucket
CREATE POLICY "course_media_update_staff"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-media'
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'soporte'::public.app_role))
)
WITH CHECK (
  bucket_id = 'course-media'
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'soporte'::public.app_role))
);