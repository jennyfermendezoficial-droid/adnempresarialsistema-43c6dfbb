
-- 1) Fix realtime chat_1a1 split_part bug: use regex substring to extract chat UUID
DROP POLICY IF EXISTS realtime_chat_1a1_participants ON realtime.messages;
CREATE POLICY realtime_chat_1a1_participants ON realtime.messages
FOR SELECT TO authenticated
USING (
  (
    realtime.topic() LIKE 'rt-mensajes_chat_1a1-%'
    OR realtime.topic() LIKE 'chat-1a1-%'
    OR realtime.topic() LIKE 'mensajes_chat_1a1-%'
    OR realtime.topic() LIKE 'chats_1a1-%'
  )
  AND EXISTS (
    SELECT 1 FROM public.chats_1a1 c
    WHERE c.id::text = substring(realtime.topic() from '([0-9a-fA-F-]{36})$')
      AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
  )
);

-- 2) Remove broad 'realtime:%' wildcard; replace with table-scoped allowlist
DROP POLICY IF EXISTS realtime_authenticated_postgres_changes ON realtime.messages;
CREATE POLICY realtime_authenticated_postgres_changes ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'sesiones_1a1%'
  OR realtime.topic() LIKE 'ae_%'
  OR realtime.topic() = 'realtime:public:sesiones_1a1'
  OR realtime.topic() LIKE 'realtime:public:ae_%'
);

-- 3) Scoped realtime policy for clases_en_vivo: only staff or users with at least one course permission
CREATE POLICY realtime_clases_en_vivo_scoped ON realtime.messages
FOR SELECT TO authenticated
USING (
  (realtime.topic() = 'realtime:public:clases_en_vivo' OR realtime.topic() LIKE 'clases_en_vivo%')
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'soporte'::app_role)
    OR EXISTS (SELECT 1 FROM public.permisos_cursos pc WHERE pc.usuario_id = auth.uid())
  )
);

-- 4) calificaciones_mensuales: admin/soporte can update and delete
CREATE POLICY calif_staff_update ON public.calificaciones_mensuales
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'soporte'::app_role));

CREATE POLICY calif_staff_or_self_delete ON public.calificaciones_mensuales
FOR DELETE TO authenticated
USING (
  alumna_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
);

-- 5) mensajes_chat_1a1: admins can delete any message
CREATE POLICY msg_admin_delete ON public.mensajes_chat_1a1
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6) profiles tarifa columns: revoke direct SELECT from authenticated.
--    Access remains via SECURITY DEFINER functions get_my_tarifas / get_profesor_tarifas.
REVOKE SELECT (tarifa_hora_clase, tarifa_sesion_1a1) ON public.profiles FROM authenticated;
GRANT SELECT (
  id, email, nombre_completo, avatar_url, estado,
  negocio_nombre, negocio_foto_url, created_at, updated_at
) ON public.profiles TO authenticated;
