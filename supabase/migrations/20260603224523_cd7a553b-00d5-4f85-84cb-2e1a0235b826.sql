
DROP POLICY IF EXISTS realtime_clases_en_vivo_scoped ON realtime.messages;

CREATE POLICY realtime_clases_en_vivo_scoped ON realtime.messages
FOR SELECT TO authenticated
USING (
  (
    realtime.topic() LIKE 'clases_en_vivo%'
    OR realtime.topic() = 'realtime:public:clases_en_vivo'
  )
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'soporte'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.clases_en_vivo cv
      WHERE (cv.id)::text = substring(realtime.topic(), '([0-9a-fA-F-]{36})$')
        AND (
          cv.profesor_id = auth.uid()
          OR (
            cv.curso_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.permisos_cursos pc
              WHERE pc.usuario_id = auth.uid()
                AND pc.curso_id = cv.curso_id
            )
          )
        )
    )
  )
);

DROP POLICY IF EXISTS entregas_update_self_or_staff ON public.tareas_entregas;
DROP POLICY IF EXISTS entregas_update_staff ON public.tareas_entregas;
DROP POLICY IF EXISTS entregas_update_self ON public.tareas_entregas;

CREATE POLICY entregas_update_staff ON public.tareas_entregas
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'soporte'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'soporte'::public.app_role)
);

CREATE POLICY entregas_update_self ON public.tareas_entregas
FOR UPDATE TO authenticated
USING (alumna_id = auth.uid())
WITH CHECK (alumna_id = auth.uid());

REVOKE UPDATE ON public.tareas_entregas FROM authenticated;
GRANT UPDATE (archivo_url, archivo_nombre, archivo_tipo, archivos, comentario) ON public.tareas_entregas TO authenticated;
GRANT UPDATE ON public.tareas_entregas TO service_role;
