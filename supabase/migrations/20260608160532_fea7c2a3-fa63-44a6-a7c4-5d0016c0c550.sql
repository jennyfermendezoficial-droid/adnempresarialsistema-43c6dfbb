DROP POLICY IF EXISTS entregas_update_self ON public.tareas_entregas;
CREATE POLICY entregas_update_self ON public.tareas_entregas
FOR UPDATE
USING (alumna_id = auth.uid())
WITH CHECK (
  alumna_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id = tareas_entregas.tarea_id
      AND (
        t.curso_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.permisos_cursos pc
          WHERE pc.curso_id = t.curso_id AND pc.usuario_id = auth.uid()
        )
      )
  )
);