DROP POLICY IF EXISTS "realtime_authenticated_postgres_changes" ON realtime.messages;

CREATE POLICY "realtime_authenticated_postgres_changes"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    (realtime.topic() LIKE 'sesiones_1a1%' OR realtime.topic() = 'realtime:public:sesiones_1a1')
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'soporte'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.sesiones_1a1 s
        WHERE s.profesor_id = auth.uid() OR s.alumna_id = auth.uid()
      )
    )
  )
  OR (
    (realtime.topic() LIKE 'ae_%' OR realtime.topic() LIKE 'realtime:public:ae_%')
    AND realtime.topic() LIKE ('%' || auth.uid()::text || '%')
  )
);