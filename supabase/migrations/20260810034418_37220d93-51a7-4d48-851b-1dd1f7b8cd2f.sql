CREATE POLICY "equipo ve comprobantes" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'comprobantes' AND (
    public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'soporte'::public.app_role)
  )
);

CREATE POLICY "admin sube comprobantes" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'comprobantes' AND public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "admin actualiza comprobantes" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'comprobantes' AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (bucket_id = 'comprobantes' AND public.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY "admin borra comprobantes" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'comprobantes' AND public.has_role(auth.uid(),'admin'::public.app_role));