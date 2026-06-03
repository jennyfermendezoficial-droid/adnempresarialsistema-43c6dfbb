
-- 1) Tighten Realtime policy on clases_en_vivo: must match curso_id in topic
DROP POLICY IF EXISTS realtime_clases_en_vivo_scoped ON realtime.messages;
CREATE POLICY realtime_clases_en_vivo_scoped
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'postgres_changes'
  AND EXISTS (
    SELECT 1 FROM public.clases_en_vivo c
    WHERE c.id::text = split_part(realtime.topic(), ':', 2)
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'soporte'::public.app_role)
        OR c.profesor_id = auth.uid()
        OR (
          c.curso_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.permisos_cursos pc
            WHERE pc.usuario_id = auth.uid()
              AND pc.curso_id = c.curso_id
          )
        )
      )
  )
);

-- 2) Add UPDATE policy on the 'tareas' storage bucket (owner or staff)
DROP POLICY IF EXISTS tareas_update_own_or_staff ON storage.objects;
CREATE POLICY tareas_update_own_or_staff
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tareas'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'soporte'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'tareas'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'soporte'::public.app_role)
  )
);

-- 3) Tighten alumna UPDATE on tareas_entregas: tarea_id must belong to a permitted course
DROP POLICY IF EXISTS entregas_update_self ON public.tareas_entregas;
CREATE POLICY entregas_update_self
ON public.tareas_entregas
FOR UPDATE
TO authenticated
USING (alumna_id = auth.uid())
WITH CHECK (
  alumna_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.tareas t
    JOIN public.permisos_cursos pc
      ON pc.curso_id = t.curso_id
     AND pc.usuario_id = auth.uid()
    WHERE t.id = tareas_entregas.tarea_id
  )
);
