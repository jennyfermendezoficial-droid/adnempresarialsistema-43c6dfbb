
CREATE POLICY "freelance sube sus archivos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='freelance' AND (storage.foldername(name))[1]=auth.uid()::text AND public.es_freelance(auth.uid()));
CREATE POLICY "freelance lee sus archivos o pagos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='freelance' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.puede_pagos(auth.uid())));
CREATE POLICY "freelance borra sus archivos o pagos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='freelance' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.puede_pagos(auth.uid())));
