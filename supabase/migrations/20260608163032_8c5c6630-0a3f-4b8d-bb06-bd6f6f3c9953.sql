
-- 1) canal_general_mensajes: prevent alumnas from pinning or soft-deleting
ALTER POLICY canal_update_self_or_staff ON public.canal_general_mensajes
  USING (
    autor_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'soporte'::app_role)
  )
  WITH CHECK (
    (
      autor_id = auth.uid()
      AND anclado = false
      AND eliminado = false
    )
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'soporte'::app_role)
  );

-- 2) tareas_entregas: restrict the self-update policy to authenticated role
DROP POLICY IF EXISTS entregas_update_self ON public.tareas_entregas;
CREATE POLICY entregas_update_self ON public.tareas_entregas
  FOR UPDATE
  TO authenticated
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

-- 3) realtime: scope sesiones_1a1 topic to staff or participants
DROP POLICY IF EXISTS realtime_authenticated_postgres_changes ON realtime.messages;
CREATE POLICY realtime_authenticated_postgres_changes ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (
      realtime.topic() LIKE 'ae_%'
      OR realtime.topic() LIKE 'realtime:public:ae_%'
    )
    OR (
      (
        realtime.topic() LIKE 'sesiones_1a1%'
        OR realtime.topic() = 'realtime:public:sesiones_1a1'
      )
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'soporte'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.sesiones_1a1 s
          WHERE s.profesor_id = auth.uid() OR s.alumna_id = auth.uid()
        )
      )
    )
  );
